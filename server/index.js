const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');

const app = express();
const port = process.env.PORT || 3000;

console.log('Starting server with process UID:', process.getuid ? process.getuid() : 'N/A');
console.log('Starting server with process GID:', process.getgid ? process.getgid() : 'N/A');

// Ensure data directory exists with proper permissions
const dataDir = path.join(__dirname, '..', 'data');
console.log('Data directory path:', dataDir);

try {
    if (!fs.existsSync(dataDir)) {
        // Try to create the directory, but don't try to change permissions
        fs.mkdirSync(dataDir, { recursive: true });
        console.log('Created data directory:', dataDir);
    }
    
    // Log directory information
    const stats = fs.statSync(dataDir);
    console.log('Directory stats:', {
        mode: stats.mode.toString(8),
        uid: stats.uid,
        gid: stats.gid,
        isDirectory: stats.isDirectory(),
        isWritable: Boolean(stats.mode & 0o200)
    });
} catch (err) {
    console.error('Error with data directory:', err);
    // Don't exit, try to continue
    console.log('Continuing despite data directory error');
}

const dbPath = path.join(dataDir, 'devices.db');
console.log('Database path:', dbPath);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

// Database setup
function initializeDatabase() {
    return new Promise((resolve, reject) => {
        console.log('Initializing database...');
        
        // Remove existing database if it exists
        try {
            if (fs.existsSync(dbPath)) {
                try {
                    fs.unlinkSync(dbPath);
                    console.log('Removed existing database file');
                } catch (err) {
                    console.warn('Could not remove existing database file:', err);
                    // Continue anyway
                }
            }
        } catch (err) {
            console.warn('Error checking if database exists:', err);
            // Continue anyway
        }
        
        // Try to open the database without creating a file first
        console.log('Opening database connection...');
        const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
            if (err) {
                console.error('Error opening database:', err);
                reject(err);
                return;
            }
            console.log('Connected to SQLite database at:', dbPath);

            // Set database configuration
            db.configure('busyTimeout', 5000);
            
            // Only use WAL mode if explicitly not disabled
            if (process.env.SQLITE_DISABLE_WAL !== '1') {
                try {
                    db.run('PRAGMA journal_mode = WAL', function(err) {
                        if (err) {
                            console.warn('WAL mode not supported, using default journal mode:', err);
                        } else {
                            console.log('Set journal mode to WAL');
                        }
                    });
                } catch (err) {
                    console.warn('Error setting journal mode:', err);
                }
            } else {
                console.log('WAL mode disabled by environment variable');
            }

            db.serialize(() => {
                // Enable foreign keys
                try {
                    db.run('PRAGMA foreign_keys = ON', (err) => {
                        if (err) {
                            console.error('Error enabling foreign keys:', err);
                        } else {
                            console.log('Enabled foreign keys');
                        }
                    });
                } catch (err) {
                    console.warn('Error setting foreign keys:', err);
                }

                // Create tables
                console.log('Creating database tables...');
                
                // Devices table
                db.run(`CREATE TABLE IF NOT EXISTS devices (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    serialNumber TEXT NOT NULL,
                    assetId TEXT NOT NULL,
                    status TEXT NOT NULL,
                    assignedTo TEXT,
                    staffMember TEXT,
                    ward TEXT,
                    checkoutTime TEXT,
                    checkoutNotes TEXT,
                    dateAdded TEXT NOT NULL
                )`, (err) => {
                    if (err) {
                        console.error('Error creating devices table:', err);
                        reject(err);
                        return;
                    }
                    console.log('Devices table created or already exists');
                });

                // Device history table
                db.run(`CREATE TABLE IF NOT EXISTS device_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    deviceId TEXT NOT NULL,
                    type TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    pupil TEXT,
                    staff TEXT,
                    ward TEXT,
                    notes TEXT,
                    FOREIGN KEY (deviceId) REFERENCES devices(id)
                )`, (err) => {
                    if (err) {
                        console.error('Error creating device_history table:', err);
                        reject(err);
                        return;
                    }
                    console.log('Device history table created or already exists');
                });

                // Staff table
                db.run(`CREATE TABLE IF NOT EXISTS staff (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    role TEXT NOT NULL
                )`, (err) => {
                    if (err) {
                        console.error('Error creating staff table:', err);
                        reject(err);
                        return;
                    }
                    console.log('Staff table created or already exists');
                });

                // Wards table
                db.run(`CREATE TABLE IF NOT EXISTS wards (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL
                )`, (err) => {
                    if (err) {
                        console.error('Error creating wards table:', err);
                        reject(err);
                        return;
                    }
                    console.log('Wards table created or already exists');
                });

                // Check if we need to add sample data
                db.get("SELECT COUNT(*) as count FROM devices", (err, row) => {
                    if (err) {
                        console.error('Error checking devices table:', err);
                        // Continue anyway, assume we need to add sample data
                        addSampleData(db);
                    } else if (row.count === 0) {
                        // Add sample data if table is empty
                        addSampleData(db);
                    } else {
                        console.log('Sample data already exists, skipping');
                        resolve(db);
                    }
                });
            });
        });
    });
}

// Function to add sample data
function addSampleData(db) {
    console.log('Adding sample data...');
    
    // Sample device
    const sampleDevice = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2),
        name: 'MacBook Pro 16"',
        serialNumber: 'FVFXC123456',
        assetId: 'IT-1001',
        status: 'available',
        dateAdded: new Date().toISOString()
    };

    db.run(`INSERT INTO devices (id, name, serialNumber, assetId, status, dateAdded)
        VALUES (?, ?, ?, ?, ?, ?)`,
        [sampleDevice.id, sampleDevice.name, sampleDevice.serialNumber, 
         sampleDevice.assetId, sampleDevice.status, sampleDevice.dateAdded],
        (err) => {
            if (err) {
                console.error('Error adding sample device:', err);
            } else {
                console.log('Sample device added successfully');
            }
        });

    // Sample staff
    try {
        const sampleStaff = [
            [Date.now().toString(36) + Math.random().toString(36).substr(2), 'John Smith', 'Teacher'],
            [Date.now().toString(36) + Math.random().toString(36).substr(2), 'Jane Doe', 'Nurse']
        ];
        const staffStmt = db.prepare('INSERT INTO staff (id, name, role) VALUES (?, ?, ?)');
        sampleStaff.forEach(staff => staffStmt.run(staff));
        staffStmt.finalize();
        console.log('Sample staff added successfully');
    } catch (err) {
        console.error('Error adding sample staff:', err);
    }

    // Sample wards
    try {
        const sampleWards = [
            [Date.now().toString(36) + Math.random().toString(36).substr(2), 'Ward A'],
            [Date.now().toString(36) + Math.random().toString(36).substr(2), 'Ward B']
        ];
        const wardStmt = db.prepare('INSERT INTO wards (id, name) VALUES (?, ?)');
        sampleWards.forEach(ward => wardStmt.run(ward));
        wardStmt.finalize();
        console.log('Sample wards added successfully');
    } catch (err) {
        console.error('Error adding sample wards:', err);
    }

    console.log('Database initialization completed successfully');
}

// Initialize database and start server
console.log('Starting database initialization...');
initializeDatabase()
    .then(db => {
        console.log('Database initialized successfully, starting server...');
        
        // Make db available globally
        app.locals.db = db;

        // Add error handler for database
        db.on('error', (err) => {
            console.error('Database error:', err);
        });

        // API Endpoints
        // Get all devices
        app.get('/api/devices', (req, res) => {
            db.all('SELECT * FROM devices', (err, rows) => {
                if (err) {
                    console.error('Error getting devices:', err);
                    res.status(500).json({ error: err.message });
                    return;
                }
                res.json(rows);
            });
        });

        // Get device history
        app.get('/api/devices/:id/history', (req, res) => {
            db.all('SELECT * FROM device_history WHERE deviceId = ? ORDER BY timestamp DESC', [req.params.id], (err, rows) => {
                if (err) {
                    res.status(500).json({ error: err.message });
                    return;
                }
                res.json(rows);
            });
        });

        // Add new device
        app.post('/api/devices', (req, res) => {
            const { name, serialNumber, assetId } = req.body;
            const id = Date.now().toString(36) + Math.random().toString(36).substr(2);
            const dateAdded = new Date().toISOString();

            db.run(`INSERT INTO devices (id, name, serialNumber, assetId, status, dateAdded)
                    VALUES (?, ?, ?, ?, 'available', ?)`,
                [id, name, serialNumber, assetId, dateAdded],
                function(err) {
                    if (err) {
                        res.status(500).json({ error: err.message });
                        return;
                    }
                    res.json({ id, name, serialNumber, assetId, status: 'available', dateAdded });
                });
        });

        // Update device (checkout/checkin)
        app.put('/api/devices/:id', (req, res) => {
            const { status, assignedTo, staffMember, ward, checkoutNotes } = req.body;
            const timestamp = new Date().toISOString();

            db.run(`UPDATE devices 
                    SET status = ?, assignedTo = ?, staffMember = ?, ward = ?, 
                        checkoutTime = ?, checkoutNotes = ?
                    WHERE id = ?`,
                [status, assignedTo, staffMember, ward, timestamp, checkoutNotes, req.params.id],
                function(err) {
                    if (err) {
                        res.status(500).json({ error: err.message });
                        return;
                    }

                    // Add to history
                    db.run(`INSERT INTO device_history (deviceId, type, timestamp, pupil, staff, ward, notes)
                            VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        [req.params.id, status === 'available' ? 'checkin' : 'checkout', 
                         timestamp, assignedTo, staffMember, ward, checkoutNotes]);

                    res.json({ success: true });
                });
        });

        // Delete device
        app.delete('/api/devices/:id', (req, res) => {
            db.run('DELETE FROM devices WHERE id = ?', [req.params.id], function(err) {
                if (err) {
                    res.status(500).json({ error: err.message });
                    return;
                }
                res.json({ success: true });
            });
        });

        // Get all staff
        app.get('/api/staff', (req, res) => {
            db.all('SELECT * FROM staff', (err, rows) => {
                if (err) {
                    res.status(500).json({ error: err.message });
                    return;
                }
                res.json(rows);
            });
        });

        // Add new staff member
        app.post('/api/staff', (req, res) => {
            const { name, role } = req.body;
            const id = Date.now().toString(36) + Math.random().toString(36).substr(2);

            db.run('INSERT INTO staff (id, name, role) VALUES (?, ?, ?)',
                [id, name, role],
                function(err) {
                    if (err) {
                        res.status(500).json({ error: err.message });
                        return;
                    }
                    res.json({ id, name, role });
                });
        });

        // Delete staff member
        app.delete('/api/staff/:id', (req, res) => {
            db.run('DELETE FROM staff WHERE id = ?', [req.params.id], function(err) {
                if (err) {
                    res.status(500).json({ error: err.message });
                    return;
                }
                res.json({ success: true });
            });
        });

        // Get all wards
        app.get('/api/wards', (req, res) => {
            db.all('SELECT * FROM wards', (err, rows) => {
                if (err) {
                    res.status(500).json({ error: err.message });
                    return;
                }
                res.json(rows);
            });
        });

        // Add new ward
        app.post('/api/wards', (req, res) => {
            const { name } = req.body;
            const id = Date.now().toString(36) + Math.random().toString(36).substr(2);

            db.run('INSERT INTO wards (id, name) VALUES (?, ?)',
                [id, name],
                function(err) {
                    if (err) {
                        res.status(500).json({ error: err.message });
                        return;
                    }
                    res.json({ id, name });
                });
        });

        // Delete ward
        app.delete('/api/wards/:id', (req, res) => {
            db.run('DELETE FROM wards WHERE id = ?', [req.params.id], function(err) {
                if (err) {
                    res.status(500).json({ error: err.message });
                    return;
                }
                res.json({ success: true });
            });
        });

        // Start server
        const server = app.listen(port, () => {
            console.log(`Server running at http://localhost:${port}`);
            console.log(`Database initialized at ${dbPath}`);
            console.log(`Platform: ${os.platform()}`);
            console.log(`Architecture: ${os.arch()}`);
            console.log('Node.js version:', process.version);
        });

        // Handle server shutdown
        process.on('SIGTERM', () => {
            console.log('SIGTERM received. Closing server and database...');
            server.close(() => {
                db.close((err) => {
                    if (err) {
                        console.error('Error closing database:', err);
                    }
                    console.log('Server and database closed');
                    process.exit(0);
                });
            });
        });
    })
    .catch(err => {
        console.error('Failed to initialize database:', err);
        console.error('Error details:', err.code, err.errno);
        process.exit(1);
    }); 