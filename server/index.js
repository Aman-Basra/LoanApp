const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

// Database setup
const db = new sqlite3.Database('devices.db', (err) => {
    if (err) {
        console.error('Error opening database:', err);
    } else {
        console.log('Connected to SQLite database');
        initializeDatabase();
    }
});

// Initialize database tables
function initializeDatabase() {
    db.serialize(() => {
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
        )`);

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
        )`);

        // Staff table
        db.run(`CREATE TABLE IF NOT EXISTS staff (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            role TEXT NOT NULL
        )`);

        // Wards table
        db.run(`CREATE TABLE IF NOT EXISTS wards (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL
        )`);

        // Add sample data if tables are empty
        db.get("SELECT COUNT(*) as count FROM devices", (err, row) => {
            if (err) {
                console.error('Error checking devices:', err);
                return;
            }
            if (row.count === 0) {
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
                     sampleDevice.assetId, sampleDevice.status, sampleDevice.dateAdded]);
            }
        });

        db.get("SELECT COUNT(*) as count FROM staff", (err, row) => {
            if (err) {
                console.error('Error checking staff:', err);
                return;
            }
            if (row.count === 0) {
                const sampleStaff = [
                    [Date.now().toString(36) + Math.random().toString(36).substr(2), 'John Smith', 'Teacher'],
                    [Date.now().toString(36) + Math.random().toString(36).substr(2), 'Jane Doe', 'Nurse']
                ];
                const stmt = db.prepare('INSERT INTO staff (id, name, role) VALUES (?, ?, ?)');
                sampleStaff.forEach(staff => stmt.run(staff));
                stmt.finalize();
            }
        });

        db.get("SELECT COUNT(*) as count FROM wards", (err, row) => {
            if (err) {
                console.error('Error checking wards:', err);
                return;
            }
            if (row.count === 0) {
                const sampleWards = [
                    [Date.now().toString(36) + Math.random().toString(36).substr(2), 'Ward A'],
                    [Date.now().toString(36) + Math.random().toString(36).substr(2), 'Ward B']
                ];
                const stmt = db.prepare('INSERT INTO wards (id, name) VALUES (?, ?)');
                sampleWards.forEach(ward => stmt.run(ward));
                stmt.finalize();
            }
        });
    });
}

// API Endpoints

// Get all devices
app.get('/api/devices', (req, res) => {
    db.all('SELECT * FROM devices', (err, rows) => {
        if (err) {
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
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
}); 