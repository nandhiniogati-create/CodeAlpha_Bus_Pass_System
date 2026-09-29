

const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const app = express();

const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Serve frontend files
app.use(express.static(path.join(__dirname, "../frontend")));

// SQLite database
const dbPath = path.join(__dirname, "buspass.db");

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error("Database connection failed:", err.message);
    } else {
        console.log("SQLite database connected");
    }
});

// Create table
db.run(`
    CREATE TABLE IF NOT EXISTS bus_passes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        passenger_name TEXT NOT NULL,
        email TEXT NOT NULL,
        route TEXT NOT NULL,
        pass_type TEXT NOT NULL,
        price REAL NOT NULL,
        booking_code TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL DEFAULT 'BOOKED',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`, (err) => {
    if (err) {
        console.error("Table creation failed:", err.message);
    } else {
        console.log("Bus pass table ready");
    }
});

// Fixed server-side prices
const prices = {
    "City Route": {
        Daily: 50,
        Weekly: 250,
        Monthly: 800
    },

    "Airport Route": {
        Daily: 100,
        Weekly: 500,
        Monthly: 1500
    },

    "Express Route": {
        Daily: 120,
        Weekly: 600,
        Monthly: 1800
    }
};

// Generate unique booking code
function generateBookingCode() {
    return (
        "BP-" +
        Date.now() +
        "-" +
        Math.random()
            .toString(36)
            .substring(2, 8)
            .toUpperCase()
    );
}

// Home page
app.get("/", (req, res) => {
    res.sendFile(
        path.join(__dirname, "../frontend/index.html")
    );
});

// Health check
app.get("/api/health", (req, res) => {
    res.json({
        status: "OK",
        service: "CodeAlpha Cloud Bus Pass System",
        database: "SQLite",
        timestamp: new Date().toISOString()
    });
});

// Get routes and prices
app.get("/api/routes", (req, res) => {
    res.json({
        success: true,
        routes: Object.keys(prices),
        prices: prices
    });
});

// Book bus pass
app.post("/api/book", (req, res) => {

    const {
        passenger_name,
        email,
        route,
        pass_type
    } = req.body;

    // Validate fields
    if (
        !passenger_name ||
        !email ||
        !route ||
        !pass_type
    ) {
        return res.status(400).json({
            success: false,
            message: "All booking fields are required."
        });
    }

    // Validate email
    const emailRegex =
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
        return res.status(400).json({
            success: false,
            message: "Please enter a valid email address."
        });
    }

    // Validate route and pass type
    if (
        !prices[route] ||
        !prices[route][pass_type]
    ) {
        return res.status(400).json({
            success: false,
            message: "Invalid route or pass type."
        });
    }

    // IMPORTANT:
    // Price is calculated by server.
    // Client cannot modify the price.
    const price = prices[route][pass_type];

    const bookingCode = generateBookingCode();

    const sql = `
        INSERT INTO bus_passes
        (
            passenger_name,
            email,
            route,
            pass_type,
            price,
            booking_code,
            status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    db.run(
        sql,
        [
            passenger_name.trim(),
            email.trim().toLowerCase(),
            route,
            pass_type,
            price,
            bookingCode,
            "BOOKED"
        ],
        function (err) {

            if (err) {
                console.error(
                    "Booking error:",
                    err.message
                );

                return res.status(500).json({
                    success: false,
                    message: "Booking failed."
                });
            }

            return res.status(201).json({
                success: true,
                message: "Bus pass booked successfully.",
                booking: {
                    id: this.lastID,
                    passenger_name:
                        passenger_name.trim(),
                    email:
                        email.trim().toLowerCase(),
                    route,
                    pass_type,
                    price,
                    booking_code: bookingCode,
                    status: "BOOKED"
                }
            });
        }
    );
});

// Get all bookings for an email
app.get("/api/bookings/:email", (req, res) => {

    const email = req.params.email
        .trim()
        .toLowerCase();

    const sql = `
        SELECT
            id,
            passenger_name,
            email,
            route,
            pass_type,
            price,
            booking_code,
            status,
            created_at
        FROM bus_passes
        WHERE email = ?
        ORDER BY created_at DESC
    `;

    db.all(sql, [email], (err, rows) => {

        if (err) {
            console.error(
                "Booking retrieval error:",
                err.message
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to retrieve bookings."
            });
        }

        res.json({
            success: true,
            count: rows.length,
            bookings: rows
        });
    });
});

// Verify booking using booking code
app.get("/api/booking/:code", (req, res) => {

    const bookingCode =
        req.params.code.trim().toUpperCase();

    const sql = `
        SELECT
            id,
            passenger_name,
            email,
            route,
            pass_type,
            price,
            booking_code,
            status,
            created_at
        FROM bus_passes
        WHERE booking_code = ?
    `;

    db.get(
        sql,
        [bookingCode],
        (err, row) => {

            if (err) {
                console.error(
                    "Booking verification error:",
                    err.message
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to verify booking."
                });
            }

            if (!row) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Booking not found."
                });
            }

            return res.json({
                success: true,
                message: "Booking verified successfully.",
                booking: row
            });
        }
    );
});

// Cancel booking
app.patch("/api/booking/:code/cancel", (req, res) => {

    const bookingCode =
        req.params.code.trim().toUpperCase();

    const sql = `
        UPDATE bus_passes
        SET status = 'CANCELLED'
        WHERE booking_code = ?
    `;

    db.run(
        sql,
        [bookingCode],
        function (err) {

            if (err) {
                console.error(
                    "Cancellation error:",
                    err.message
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to cancel booking."
                });
            }

            if (this.changes === 0) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Booking not found."
                });
            }

            return res.json({
                success: true,
                message:
                    "Booking cancelled successfully."
            });
        }
    );
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "Route not found.",
        requestedRoute: req.originalUrl
    });
});

// Start server
app.listen(PORT, () => {

    console.log(
        `Bus Pass System running at http://localhost:${PORT}`
    );

    console.log(
        "Frontend: http://localhost:" + PORT
    );

    console.log(
        "API Routes:"
    );

    console.log(
        "GET  /api/health"
    );

    console.log(
        "GET  /api/routes"
    );

    console.log(
        "POST /api/book"
    );

    console.log(
        "GET  /api/bookings/:email"
    );

    console.log(
        "GET  /api/booking/:code"
    );

    console.log(
        "PATCH /api/booking/:code/cancel"
    );
});