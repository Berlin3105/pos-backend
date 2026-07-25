const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
//const { getPrinters, print } = require('pdf-to-printer');
const pdf = require('html-pdf');
require('dotenv').config();

const app = express();

// Middleware Configuration
app.use(cors({
    origin: '*', // Allow requests from Vercel frontend
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json()); // JSON டேட்டாவை படிக்க

// இமேஜ் சேமிக்க 'uploads' ஃபோல்டரை புரோகிராம் லொகேஷனில் உருவாக்குகிறோம்
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Multer Storage Configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // ஒரே பெயரில் ஃபைல் ஓவர்ரைட் ஆகாமல் இருக்க டைம்ஸ்டாம்ப் சேர்க்கிறோம்
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Static Folder ஆக மாற்றுவதால் ஃபிரண்ட் எண்டில் இமேஜ் காட்ட முடியும்
app.use('/uploads', express.static(uploadDir));


// MySQL டேட்டாபேஸ் இணைப்பு விபரங்கள்
// const db = mysql.createConnection({
//     host: 'localhost',
//     user: 'root',      // உங்க MySQL யூசர்நேம் (வழக்கமாக root)
//     password: 'root',      // உங்க MySQL பாஸ்வேர்ட் (இல்லைனா காலியாக விடவும்)
//     database: 'jb_pos_db'
// });

// const db = mysql.createConnection({
//     host: process.env.DB_HOST || 'mysql-335d3858-pos-project.f.aivencloud.com',
//     user: process.env.DB_USER || 'avnadmin',
//     password: process.env.DB_PASSWORD,
//     //password: process.env.DB_PASSWORD || 'AVNS_YTxkP6WgP4Ktj2jPk2L',
//     database: process.env.DB_NAME || 'jb_pos_db',
//     port: process.env.DB_PORT || 26228,
//     ssl: { rejectUnauthorized: false }
// });

// const db = mysql.createConnection({
//     host: process.env.DB_HOST || 'mysql-335d3858-pos-project.f.aivencloud.com',
//     user: process.env.DB_USER || 'avnadmin',
//     password: process.env.DB_PASSWORD,
//     //password: process.env.DB_PASSWORD || 'AVNS_YTxkP6WgP4Ktj2jPk2L',
//     database: process.env.DB_NAME || 'jb_pos_db',
//     port: process.env.DB_PORT || 26228,
//     ssl: process.env.DB_HOST ? { rejectUnauthorized: false } : false
// });


//const isLocal = 'online' !== 'production' && !process.env.DB_HOST;
// const isLocal = 'True';

// const dbConfig = isLocal ? {
//     // 💻 LOCAL DATABASE CONFIG (PC MySQL)
//     host: 'localhost',
//     user: 'root',
//     password: 'root', // Unga PC local MySQL password
//     database: 'jb_pos_db',
// } : {
//     // 🌐 ONLINE DATABASE CONFIG (Aiven Cloud)
//     host: process.env.DB_HOST || 'mysql-335d3858-pos-project.f.aivencloud.com',
//     user: process.env.DB_USER || 'avnadmin',
//     password: process.env.DB_PASSWORD, // Render env variable or fallback
//     database: process.env.DB_NAME || 'jb_pos_db',
//     port: process.env.DB_PORT || 26228,
//     ssl: { rejectUnauthorized: false }
// };

// const db = mysql.createConnection(dbConfig);


// db.connect((err) => {
//     if (err) {
//         console.error('Database connection failed: ' + err.stack);
//         return;
//     }
//     console.log('Connected to MySQL Database successfully.');
// });

const db = mysql.createPool({
    host: process.env.DB_HOST || 'mysql-335d3858-pos-project.f.aivencloud.com',
    user: process.env.DB_USER || 'avnadmin',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'jb_pos_db',
    port: process.env.DB_PORT || 26228,
    ssl: { rejectUnauthorized: false },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Test the pool connection on start
db.getConnection((err, connection) => {
    if (err) {
        console.error('Database connection failed:', err.message);
        return;
    }
    console.log('Connected to Aiven MySQL Database successfully via Pool.');
    connection.release(); // Release connection back to pool
});

// ====================================================================
// 🔐 Node.js Backend Login Controller
// ====================================================================
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const [rows] = await db.query(
      "SELECT id, username, role, linked_waiters FROM users WHERE username = ? AND password = ?", 
      [username, password]
    );

    if (rows && rows.length > 0) {
      const user = rows[0];
      
      let linkedWaitersArray = [];
      if (user.linked_waiters) {
        try {
          linkedWaitersArray = typeof user.linked_waiters === 'string' 
            ? JSON.parse(user.linked_waiters) 
            : user.linked_waiters;
        } catch (e) {
          linkedWaitersArray = String(user.linked_waiters).split(',').map(Number);
        }
      }

      res.json({
        id: user.id,
        username: user.username,
        role: user.role,
        linked_waiters: linkedWaitersArray
      });
    } else {
      res.status(401).json({ error: "Invalid username or password!" });
    }
  } catch (err) {
    // 💡 Print full error details to Render logs
    console.error("Login API Detailed Error:", err.message, err.stack);
    res.status(500).json({ error: err.message || "Database Connection Failed" });
  }
});

// 1. புதிய லெட்ஜர் ஐடி தானாக உருவாக்க (Get Next Auto Ledger ID)
app.get('/api/ledgers/next-id', async (req, res) => {
    try {
        const currentYear = new Date().getFullYear().toString().slice(-2); 
        const idPrefix = `ID${currentYear}/`;

        const query = "SELECT ledger_id FROM ledgers WHERE ledger_id LIKE ? ORDER BY id DESC LIMIT 1";
        const [results] = await db.query(query, [`${idPrefix}%`]);

        let nextNumber = 1;
        if (results.length > 0) {
            const lastId = results[0].ledger_id; 
            const lastNumber = parseInt(lastId.split('/')[1]); 
            nextNumber = lastNumber + 1;
        }

        res.json({ nextId: `${idPrefix}${nextNumber}` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. புதிய லெட்ஜர் சேமிக்க (Create Ledger)
app.post('/api/ledgers', async (req, res) => {
    try {
        const { ledger_id, ledger_name, mobile_no, email_id, gstno, address } = req.body;
        const query = "INSERT INTO ledgers (ledger_id, ledger_name, mobile_no, email_id, gstno, address) VALUES (?, ?, ?, ?, ?, ?)";
        await db.query(query, [ledger_id, ledger_name, mobile_no, email_id, gstno, address]);
        res.json({ message: "Ledger created successfully!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. அனைத்து லெட்ஜர்களையும் எடுக்க (Read All Ledgers)
app.get('/api/ledgers', async (req, res) => {
    try {
        const [results] = await db.query("SELECT * FROM ledgers ORDER BY ledger_name ASC");
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. லெட்ஜர் விபரங்களை மாற்றியமைக்க (Update Ledger)
app.put('/api/ledgers/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { ledger_name, mobile_no, email_id, gstno, address } = req.body;
        const query = "UPDATE ledgers SET ledger_name=?, mobile_no=?, email_id=?, gstno=?, address=? WHERE id=?";
        await db.query(query, [ledger_name, mobile_no, email_id, gstno, address, id]);
        res.json({ message: "Ledger updated successfully!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. லெட்ஜரை நீக்க (Delete Ledger)
app.delete('/api/ledgers/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await db.query("DELETE FROM ledgers WHERE id = ?", [id]);
        res.json({ message: "Ledger deleted successfully!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// PRODUCT SETUP API MODULE
// ==========================================

// 1. விடுபட்ட அல்லது அடுத்த தயாரிப்பு குறியீட்டை எடுக்க
app.get('/api/products/next-code', async (req, res) => {
    try {
        const [results] = await db.query("SELECT product_code FROM products ORDER BY product_code ASC");
        const existingCodes = results.map(r => Number(r.product_code));
        let nextCode = 1;
        while (existingCodes.includes(nextCode)) {
            nextCode++;
        }
        res.json({ nextCode });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. புதிய தயாரிப்பைச் சேமிக்க (Create Product)
app.post('/api/products', async (req, res) => {
    try {
        const { product_code, product_name, tamil_product_name, ac_rate, non_ac_rate, hsn_code, product_group, tamil_product_group, unit } = req.body;
        const query = `INSERT INTO products (product_code, product_name, tamil_product_name, ac_rate, non_ac_rate, hsn_code, product_group, tamil_product_group, unit) 
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        await db.query(query, [product_code, product_name, tamil_product_name, ac_rate, non_ac_rate, hsn_code, product_group, tamil_product_group, unit]);
        res.json({ message: "Product created successfully!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. அனைத்து தயாரிப்புகளையும் எடுக்க
app.get('/api/products', async (req, res) => {
    try {
        const [results] = await db.query("SELECT * FROM products ORDER BY product_code ASC");
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. தயாரிப்பு விபரங்களை மாற்றியமைக்க
app.put('/api/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { product_name, tamil_product_name, ac_rate, non_ac_rate, hsn_code, product_group, tamil_product_group, unit } = req.body;
        const query = `UPDATE products SET product_name=?, tamil_product_name=?, ac_rate=?, non_ac_rate=?, hsn_code=?, product_group=?, tamil_product_group=?, unit=? WHERE id=?`;
        await db.query(query, [product_name, tamil_product_name, ac_rate, non_ac_rate, hsn_code, product_group, tamil_product_group, unit, id]);
        res.json({ message: "Product updated successfully!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. தயாரிப்பை நீக்க
app.delete('/api/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await db.query("DELETE FROM products WHERE id = ?", [id]);
        res.json({ message: "Product deleted successfully!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 6. ஆங்கில தயாரிப்பு குழுக்களை மட்டும் எடுக்க
app.get('/api/products/groups-en', async (req, res) => {
    try {
        const query = "SELECT product_group FROM products WHERE product_group IS NOT NULL AND product_group != '' GROUP BY product_group";
        const [results] = await db.query(query);
        res.json(results.map(r => r.product_group));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 7. தமிழ் தயாரிப்பு குழுக்களை மட்டும் எடுக்க
app.get('/api/products/groups-ta', async (req, res) => {
    try {
        const query = "SELECT tamil_product_group FROM products WHERE tamil_product_group IS NOT NULL AND tamil_product_group != '' GROUP BY tamil_product_group";
        const [results] = await db.query(query);
        res.json(results.map(r => r.tamil_product_group));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 1. சிஸ்டமில் உள்ள பிரிண்டர்கள்
// app.get('/api/system-printers', async (req, res) => {
//     try {
//         const printers = await getPrinters();
//         const printerNames = printers.map(p => p.name);
//         res.json(printerNames);
//     } catch (err) {
//         console.error("Error fetching system printers:", err);
//         res.json([]);
//     }
// });

const ptp = require('pdf-to-printer');

app.get('/api/system-printers', async (req, res) => {
  try {
    const printers = await ptp.getPrinters();
    res.json(printers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(5000, () => {
  console.log('Local Server running on http://localhost:5000');
});

// 2. கம்பெனியைச் சேமிக்க அல்லது புதுப்பிக்க
app.post('/api/companies/save-single', upload.single('image'), async (req, res) => {
    try {
        const { 
            id, company_name, address1, address2, address3, state, state_code, 
            mobile_no, phone_no, gst_no, email_no, cash_in_hand_account, sales_account, existing_image,
            kot_printer, sales_printer, report_printer, kot_lang, sales_lang 
        } = req.body;
        
        let image_path = req.file ? `uploads/${req.file.filename}` : (existing_image || null);
        const cashAccountValue = (cash_in_hand_account && cash_in_hand_account !== 'null' && cash_in_hand_account !== '') ? cash_in_hand_account : null;
        const salesAccountValue = (sales_account && sales_account !== 'null' && sales_account !== '') ? sales_account : null;

        if (id && id !== 'null' && id !== '') {
            const query = `
                UPDATE companies SET 
                company_name=?, address1=?, address2=?, address3=?, state=?, state_code=?, mobile_no=?, phone_no=?, gst_no=?, email_no=?, image_path=?, cash_in_hand_account=?, sales_account=?,
                kot_printer=?, sales_printer=?, report_printer=?, kot_lang=?, sales_lang=? 
                WHERE id=?
            `;
            await db.query(query, [
                company_name, address1, address2, address3, state, state_code, mobile_no, phone_no, gst_no, email_no, image_path, cashAccountValue, salesAccountValue, 
                kot_printer, sales_printer, report_printer, kot_lang, sales_lang, id
            ]);
            res.json({ message: "Company Setup Updated Successfully!" });
        } else {
            const query = `
                INSERT INTO companies 
                (company_name, address1, address2, address3, state, state_code, mobile_no, phone_no, gst_no, email_no, image_path, cash_in_hand_account, sales_account, kot_printer, sales_printer, report_printer, kot_lang, sales_lang) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            await db.query(query, [
                company_name, address1, address2, address3, state, state_code, mobile_no, phone_no, gst_no, email_no, image_path, cashAccountValue, salesAccountValue,
                kot_printer, sales_printer, report_printer, kot_lang, sales_lang
            ]);
            res.json({ message: "Company Setup Saved Successfully!" });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. கம்பெனி விபரங்களை எடுக்க
app.get('/api/companies/single', async (req, res) => {
    try {
        const query = `
            SELECT c.*, 
                   l1.ledger_name as cash_ledger_name, 
                   l1.ledger_id as cash_ledger_string_id,
                   l2.ledger_name as sales_ledger_name,
                   l2.ledger_id as sales_ledger_string_id
            FROM companies c
            LEFT JOIN ledgers l1 ON c.cash_in_hand_account = l1.id
            LEFT JOIN ledgers l2 ON c.sales_account = l2.id
            LIMIT 1
        `;
        const [results] = await db.query(query);
        res.json(results[0] || null);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// WAITER SETUP APIS
// ==========================================

app.get('/api/waiters/next-id', async (req, res) => {
    try {
        const [results] = await db.query("SELECT waiter_id FROM waiters ORDER BY id DESC LIMIT 1");
        let nextId = "W-001"; 
        if (results.length > 0) {
            const lastId = results[0].waiter_id; 
            const lastNum = parseInt(lastId.split('-')[1]); 
            const nextNum = lastNum + 1;
            nextId = `W-${String(nextNum).padStart(3, '0')}`; 
        }
        res.json({ nextId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/waiters', async (req, res) => {
    try {
        const [results] = await db.query("SELECT * FROM waiters ORDER BY id DESC");
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/waiters', async (req, res) => {
    try {
        const { waiter_id, waiter_name, tamil_waiter_name } = req.body;
        const query = "INSERT INTO waiters (waiter_id, waiter_name, tamil_waiter_name) VALUES (?, ?, ?)";
        await db.query(query, [waiter_id, waiter_name, tamil_waiter_name || null]);
        res.json({ message: "Waiter Saved Successfully!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/waiters/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { waiter_name, tamil_waiter_name } = req.body;
        const query = "UPDATE waiters SET waiter_name = ?, tamil_waiter_name = ? WHERE id = ?";
        await db.query(query, [waiter_name, tamil_waiter_name || null, id]);
        res.json({ message: "Waiter Updated Successfully!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/waiters/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await db.query("DELETE FROM waiters WHERE id = ?", [id]);
        res.json({ message: "Waiter Deleted Successfully!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// TABLE SETUP APIS
// ==========================================

app.get('/api/tables', async (req, res) => {
    try {
        const [results] = await db.query("SELECT * FROM restaurant_tables ORDER BY CAST(table_no AS UNSIGNED) ASC, table_no ASC");
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/tables', async (req, res) => {
    try {
        const { table_no } = req.body;
        const [results] = await db.query("SELECT * FROM restaurant_tables WHERE table_no = ?", [table_no]);
        
        if (results.length > 0) {
            return res.status(400).json({ error: "Table Number already exists!" });
        }
        
        await db.query("INSERT INTO restaurant_tables (table_no) VALUES (?)", [table_no]);
        res.json({ message: "Table Saved Successfully!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/tables/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { table_no } = req.body;
        
        const [results] = await db.query("SELECT * FROM restaurant_tables WHERE table_no = ? AND id != ?", [table_no, id]);
        if (results.length > 0) {
            return res.status(400).json({ error: "Table Number already exists!" });
        }
        
        await db.query("UPDATE restaurant_tables SET table_no = ? WHERE id = ?", [table_no, id]);
        res.json({ message: "Table Updated Successfully!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/tables/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await db.query("DELETE FROM restaurant_tables WHERE id = ?", [id]);
        res.json({ message: "Table Deleted Successfully!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// ORDER POS SETUP APIS
// ==========================================

app.get('/api/orders/next-no', async (req, res) => {
    try {
        const [results] = await db.query("SELECT order_no FROM orders ORDER BY id DESC LIMIT 1");
        let nextNo = 1;
        if (results.length > 0) {
            const lastNo = parseInt(results[0].order_no);
            if (!isNaN(lastNo)) nextNo = lastNo + 1;
        }
        res.json({ nextNo: String(nextNo).padStart(5, '0') });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/orders', async (req, res) => {
    const connection = await db.getConnection();
    try {
        const { order_pfx, order_no, order_date, order_time, waiter_id, table_id, order_type, gross_value, gst_percent, gst_value, net_value, items, is_print } = req.body;

        const [tokenResults] = await connection.query("SELECT token_no FROM orders WHERE order_date = ? ORDER BY id DESC LIMIT 1", [order_date]);

        let nextToken = 1; 
        if (tokenResults.length > 0 && tokenResults[0].token_no) {
            const lastTokenParsed = parseInt(tokenResults[0].token_no);
            if (!isNaN(lastTokenParsed)) nextToken = lastTokenParsed + 1;
        }
        const finalTokenNo = String(nextToken).padStart(3, '0');

        await connection.beginTransaction();

        const orderQuery = "INSERT INTO orders (order_pfx, order_no, token_no, order_date, order_time, waiter_id, table_id, order_type, gross_value, gst_percent, gst_value, net_value) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
        const [result] = await connection.query(orderQuery, [order_pfx, order_no, finalTokenNo, order_date, order_time, waiter_id, table_id, order_type, gross_value, gst_percent, gst_value, net_value]);
        
        const orderId = result.insertId;
        const itemQuery = "INSERT INTO order_items (order_id, product_id, qty, rate, value) VALUES ?";
        const itemValues = items.map(item => [orderId, item.product_id, item.qty, item.rate, item.value]);

        await connection.query(itemQuery, [itemValues]);
        await connection.commit();

        res.json({ 
            message: "Order Processed Successfully!", 
            orderId: orderId 
        });

        if (is_print === true || is_print === undefined) {
            setTimeout(() => {
                triggerCustomerBillPrint(orderId);
                triggerKitchenKOTPrint(orderId);
            }, 500);
        }
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        connection.release();
    }
});

app.get('/api/orders', async (req, res) => {
    try {
        const { from_date, to_date } = req.query;
        let query = `
            SELECT 
                o.*, 
                IFNULL(w.waiter_name, 'Unknown') AS waiter_name, 
                IFNULL(t.table_no, 'N/A') AS table_no 
            FROM orders o 
            LEFT JOIN waiters w ON o.waiter_id = w.id 
            LEFT JOIN restaurant_tables t ON o.table_id = t.id 
            WHERE (o.status IS NULL OR o.status != 'COMPLETED') 
              AND o.id NOT IN (SELECT order_id FROM sales WHERE order_id IS NOT NULL) `;

        const queryParams = [];
        if (from_date && to_date) {
            query += ` AND o.order_date BETWEEN ? AND ? `;
            queryParams.push(from_date, to_date);
        }
        query += ` ORDER BY o.id DESC`;

        const [results] = await db.query(query, queryParams);
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/orders/:id', async (req, res) => {
    try {
        await db.query("DELETE FROM orders WHERE id = ?", [req.params.id]);
        res.json({ message: "Order Deleted Successfully!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 🖨️ 1. CUSTOMER BILL PRINT
async function triggerCustomerBillPrint(orderId) {
    try {
        const [companyResults] = await db.query("SELECT * FROM companies LIMIT 1");
        if (companyResults.length === 0) return;
        const company = companyResults[0];

        const orderQuery = `
            SELECT o.*, w.waiter_name, w.tamil_waiter_name, o.table_id as table_no, o.token_no 
            FROM orders o
            LEFT JOIN waiters w ON o.waiter_id = w.id
            WHERE o.id = ?`;
        const [orderResults] = await db.query(orderQuery, [orderId]);
        if (orderResults.length === 0) return;
        const order = orderResults[0];

        const itemsQuery = `
            SELECT oi.*, p.product_name, p.tamil_product_name 
            FROM order_items oi
            JOIN products p ON oi.product_id = p.id
            WHERE oi.order_id = ?`;
        const [itemResults] = await db.query(itemsQuery, [orderId]);

        const totalQty = itemResults.reduce((sum, item) => sum + Number(item.qty), 0);
        const printLanguage = company.sales_lang || 'English';
        const displayWaiter = (printLanguage === 'Tamil' && order.tamil_waiter_name) ? order.tamil_waiter_name : order.waiter_name;

        let htmlContent = `
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Hind+Madurai:wght@400;700&display=swap');
                body { width: 280px; margin: 0; padding: 5px; font-family: 'Hind Madurai', sans-serif; font-size: 13px; color: #000; }
                .center { text-align: center; }
                .bold { font-weight: bold; }
                .title { font-size: 18px; margin-bottom: 2px; text-transform: uppercase; }
                .subtitle { font-size: 12px; margin-bottom: 10px; }
                .line { border-top: 1px dashed #000; margin: 5px 0; }
                .info-table, .items-table { width: 100%; border-collapse: collapse; }
                .info-table td { padding: 2px 0; font-size: 12px; }
                .items-table th { border-bottom: 1px dashed #000; text-align: left; padding: 4px 0; font-size: 12px; }
                .items-table td { padding: 4px 0; vertical-align: top; }
                .right { text-align: right; }
                .total-section { font-size: 14px; margin-top: 5px; }
            </style>
        </head>
        <body>
            <div class="center">
                <span class="bold title">${company.company_name}</span><br/>
                <span class="subtitle">${company.address1 || ''} ${company.address2 || ''}</span>
                ${company.gst_no ? `<br/><span class="subtitle">GSTIN: ${company.gst_no}</span>` : ''}
            </div>
            <div class="line"></div>
            <table class="info-table">
                <tr>
                    <td><b>Order No:</b> ${order.order_pfx || ''}${order.order_no}</td>
                    <td class="right"><b>Table:</b> ${order.table_no ? 'Table ' + order.table_no : 'N/A'}</td>
                </tr>
                <tr>
                    <td><b>Date:</b> ${order.order_date}</td>
                    <td class="right"><b>Time:</b> ${order.order_time}</td>
                </tr>
                <tr>
                    <td><b>Waiter:</b> ${displayWaiter || 'N/A'}</td>
                </tr>
                <tr>
                    <td class="right"><span style="font-size: 14px; font-weight: bold; border: 1px solid #000; padding: 1px 4px;">TOKEN: ${order.token_no || '001'}</span></td>
                </tr>
            </table>
            <div class="line"></div>
            <table class="items-table">
                <thead>
                    <tr>
                        <th style="width: 50%;">Item</th>
                        <th class="right" style="width: 20%;">Qty</th>
                        <th class="right" style="width: 30%;">Amount</th>
                    </tr>
                </thead>
                <tbody>`;

        itemResults.forEach(item => {
            const displayProductName = (printLanguage === 'Tamil' && item.tamil_product_name) ? item.tamil_product_name : item.product_name;
            htmlContent += `
                <tr>
                    <td>${displayProductName}</td>
                    <td class="right">${item.qty}</td>
                    <td class="right">₹${Number(item.value).toFixed(2)}</td>
                </tr>`;
        });

        htmlContent += `
                </tbody>
            </table>
            <div class="line"></div>
            <table class="info-table total-section">
                <tr class="bold">
                    <td>Total Qty: ${totalQty}</td>
                    <td class="right">Gross: ₹${Number(order.gross_value).toFixed(2)}</td>
                </tr>
                ${Number(order.gst_value) > 0 ? `
                <tr>
                    <td></td>
                    <td class="right">GST (${order.gst_percent}%): ₹${Number(order.gst_value).toFixed(2)}</td>
                </tr>` : ''}
                <tr class="bold" style="font-size: 15px;">
                    <td></td>
                    <td class="right">NET TOTAL: ₹${Number(order.net_value).toFixed(2)}</td>
                </tr>
            </table>
            <div class="line"></div>
            <div class="center bold" style="margin-top: 8px; font-size: 11px;">
                ${printLanguage === 'Tamil' ? '~ நன்றி! மீண்டும் வருக ~' : '~ Thank You! Visit Again ~'}
            </div>
        </body>
        </html>`;

        const options = { width: '80mm', height: '200mm', border: '0' };
        const tempPdfPath = path.join(__dirname, `temp_customer_print_${orderId}.pdf`);

        pdf.create(htmlContent, options).toFile(tempPdfPath, (pdfErr) => {
            if (pdfErr) return;
            print(tempPdfPath)
                .then(() => {
                    console.log("Customer Bill printed successfully to Default Printer.");
                    if(fs.existsSync(tempPdfPath)) fs.unlinkSync(tempPdfPath);
                })
                .catch(pErr => {
                    console.error("Default Printer Error:", pErr);
                    if(fs.existsSync(tempPdfPath)) fs.unlinkSync(tempPdfPath);
                });
        });
    } catch (err) {
        console.error("Customer Bill Error:", err);
    }
}

// 🖨️ 2. KOT BILL PRINT
async function triggerKitchenKOTPrint(orderId) {
    try {
        const [companyResults] = await db.query("SELECT * FROM companies LIMIT 1");
        if (companyResults.length === 0) return;
        const company = companyResults[0];

        const targetPrinter = company.kot_printer;
        const printLanguage = company.kot_lang || 'English';

        if (!targetPrinter) return;

        const orderQuery = `
            SELECT o.*, w.waiter_name, w.tamil_waiter_name, o.table_id as table_no 
            FROM orders o
            LEFT JOIN waiters w ON o.waiter_id = w.id
            WHERE o.id = ?`;
        const [orderResults] = await db.query(orderQuery, [orderId]);
        if (orderResults.length === 0) return;
        const order = orderResults[0];

        const itemsQuery = `
            SELECT oi.*, p.product_name, p.tamil_product_name 
            FROM order_items oi
            JOIN products p ON oi.product_id = p.id
            WHERE oi.order_id = ?`;
        const [itemResults] = await db.query(itemsQuery, [orderId]);

        const totalQty = itemResults.reduce((sum, item) => sum + Number(item.qty), 0);
        const displayWaiter = (printLanguage === 'Tamil' && order.tamil_waiter_name) ? order.tamil_waiter_name : order.waiter_name;

        let htmlContent = `
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Hind+Madurai:wght@400;700&display=swap');
                body { width: 280px; margin: 0; padding: 5px; font-family: 'Hind Madurai', sans-serif; font-size: 14px; color: #000; }
                .center { text-align: center; }
                .bold { font-weight: bold; }
                .title { font-size: 18px; margin-bottom: 2px; text-transform: uppercase; }
                .line { border-top: 1px dashed #000; margin: 5px 0; }
                .info-table, .items-table { width: 100%; border-collapse: collapse; }
                .info-table td { padding: 2px 0; font-size: 13px; }
                .items-table th { border-bottom: 1px dashed #000; text-align: left; padding: 5px 0; font-size: 13px; }
                .items-table td { padding: 6px 0; vertical-align: top; font-size: 14px; }
                .right { text-align: right; }
            </style>
        </head>
        <body>
            <div class="center">
                <span class="bold title">** KOT / KITCHEN **</span><br/>
                <span style="font-size:16px; font-weight:bold; background:#000; color:#fff; padding:2px 5px;">Token No: ${order.token_no}</span> 
            </div>
            <div class="line"></div>
            <table class="info-table">
                <tr><td><b>Order No:</b> ${order.order_pfx || ''}${order.order_no}</td><td class="right"><b>Table:</b> ${order.table_no ? 'Table ' + order.table_no : 'N/A'}</td></tr>
                <tr><td><b>Date:</b> ${order.order_date}</td><td class="right"><b>Time:</b> ${order.order_time}</td></tr>
                <tr><td colspan="2"><b>Waiter:</b> ${displayWaiter || 'N/A'}</td></tr>
            </table>
            <div class="line"></div>
            <table class="items-table">
                <thead>
                    <tr>
                        <th style="width: 25%;">Qty</th>
                        <th style="width: 75%;">Item Name</th>
                    </tr>
                </thead>
                <tbody>`;

        itemResults.forEach(item => {
            const productName = item.product_name || item.tamil_product_name || `Item (${item.product_id})`;
            const displayProductName = (printLanguage === 'Tamil' && item.tamil_product_name) ? item.tamil_product_name : productName;

            htmlContent += `
                <tr>
                    <td class="bold" style="font-size: 16px;">${item.qty}</td>
                    <td>${displayProductName}</td>
                </tr>`;
        });

        htmlContent += `
                </tbody>
            </table>
            <div class="line"></div>
            <table class="info-table">
                <tr class="bold"><td>TOTAL QTY: ${totalQty}</td></tr>
            </table>
            <div class="line"></div>
        </body>
        </html>`;

        const options = { width: '80mm', height: '200mm', border: '0' };
        const tempPdfPath = path.join(__dirname, `temp_kot_print_${orderId}.pdf`);

        pdf.create(htmlContent, options).toFile(tempPdfPath, async (pdfErr) => {
            if (pdfErr) return;

            try {
                const allPrinters = await getPrinters();
                const printerExists = allPrinters.some(p => p.name === targetPrinter);
                if (printerExists) {
                    await print(tempPdfPath, { printer: targetPrinter });
                }
            } catch (err) {
                console.error("KOT Print Error:", err);
            } finally {
                if (fs.existsSync(tempPdfPath)) fs.unlinkSync(tempPdfPath);
            }
        });
    } catch (err) {
        console.error("KOT Setup Error:", err);
    }
}

app.get('/api/product-groups', async (req, res) => {
    try {
        const query = `
            SELECT product_group AS name 
            FROM products 
            WHERE product_group IS NOT NULL AND product_group != '' 
            GROUP BY product_group 
            ORDER BY product_group ASC
        `;
        const [results] = await db.query(query);
        const formattedGroups = results.map((item, index) => ({
            id: index + 1,
            name: item.name
        }));
        res.json(formattedGroups);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/orders/pending-tokens', async (req, res) => {
    try {
        const query = `
            SELECT o.id, o.token_no, o.net_value, o.table_id, t.table_no, w.waiter_name 
            FROM orders o
            LEFT JOIN restaurant_tables t ON o.table_id = t.id
            LEFT JOIN waiters w ON o.waiter_id = w.id
            WHERE o.id NOT IN (SELECT order_id FROM sales WHERE order_id IS NOT NULL)
              AND (o.status IS NULL OR o.status != 'COMPLETED')
            ORDER BY o.id DESC
        `;
        const [results] = await db.query(query);
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 1. குறிப்பிட்ட ஆர்டரின் முழு விபரங்கள்
app.get('/api/orders/:id', async (req, res) => {
    try {
        const orderId = req.params.id;
        const [orderResults] = await db.query("SELECT * FROM orders WHERE id = ?", [orderId]);
        if (orderResults.length === 0) return res.status(404).json({ message: "Order not found" });

        const itemQuery = `
            SELECT oi.*, p.product_name 
            FROM order_items oi
            JOIN products p ON oi.product_id = p.id
            WHERE oi.order_id = ?`;
        const [itemResults] = await db.query(itemQuery, [orderId]);

        res.json({ order: orderResults[0], items: itemResults });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. எடிட் செய்த ஆர்டரை அப்டேட் செய்ய
app.put('/api/orders/:id', async (req, res) => {
    const connection = await db.getConnection();
    try {
        const orderId = req.params.id;
        const { waiter_id, table_id, order_type, gross_value, gst_percent, gst_value, net_value, items, is_print } = req.body;

        await connection.beginTransaction();

        const updateOrderQuery = `
            UPDATE orders 
            SET waiter_id=?, table_id=?, order_type=?, gross_value=?, gst_percent=?, gst_value=?, net_value=? 
            WHERE id=?`;
        await connection.query(updateOrderQuery, [waiter_id, table_id, order_type, gross_value, gst_percent, gst_value, net_value, orderId]);

        await connection.query("DELETE FROM order_items WHERE order_id = ?", [orderId]);

        const insertItemQuery = "INSERT INTO order_items (order_id, product_id, qty, rate, value) VALUES ?";
        const itemValues = items.map(item => [orderId, item.product_id, item.qty, item.rate, item.value]);
        await connection.query(insertItemQuery, [itemValues]);

        await connection.commit();

        res.json({ message: "Order Processed Successfully!", orderId: orderId });

        if (is_print === true || is_print === undefined) {
            setTimeout(() => {
                triggerCustomerBillPrint(orderId);
                triggerKitchenKOTPrint(orderId);
            }, 500);
        }
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        connection.release();
    }
});

// ==========================================
// USER PASSWORD & PERMISSION SETUP APIS
// ==========================================

app.get('/api/setup/users', async (req, res) => {
    try {
        const query = "SELECT id, username, role, permitted_menus, linked_waiters FROM users ORDER BY username ASC";
        const [results] = await db.query(query);
        
        const formattedUsers = results.map(user => ({
            ...user,
            permitted_menus: user.permitted_menus ? (typeof user.permitted_menus === 'string' ? JSON.parse(user.permitted_menus) : user.permitted_menus) : [],
            linked_waiters: user.linked_waiters ? (typeof user.linked_waiters === 'string' ? JSON.parse(user.linked_waiters) : user.linked_waiters) : []
        }));
        res.json(formattedUsers);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/setup/users', async (req, res) => {
    try {
        const { username, password, role, permitted_menus, linked_waiters } = req.body;

        const [results] = await db.query("SELECT id FROM users WHERE username = ?", [username]);
        if (results.length > 0) {
            return res.status(400).json({ error: "Username already exists!" });
        }

        const query = "INSERT INTO users (username, password, role, permitted_menus, linked_waiters) VALUES (?, ?, ?, ?, ?)";
        await db.query(query, [
            username, 
            password, 
            role, 
            JSON.stringify(permitted_menus || []), 
            JSON.stringify(linked_waiters || [])
        ]);
        res.json({ message: "User Configuration Saved Successfully!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/setup/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { username, password, role, permitted_menus, linked_waiters } = req.body;

        let query, params;
        if (password && password.trim() !== "") {
            query = "UPDATE users SET username=?, password=?, role=?, permitted_menus=?, linked_waiters=? WHERE id=?";
            params = [username, password, role, JSON.stringify(permitted_menus), JSON.stringify(linked_waiters), id];
        } else {
            query = "UPDATE users SET username=?, role=?, permitted_menus=?, linked_waiters=? WHERE id=?";
            params = [username, role, JSON.stringify(permitted_menus), JSON.stringify(linked_waiters), id];
        }

        await db.query(query, params);
        res.json({ message: "User Configuration Updated Successfully!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/setup/users/:id', async (req, res) => {
    try {
        await db.query("DELETE FROM users WHERE id = ?", [req.params.id]);
        res.json({ message: "User Deleted Successfully!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 💳 SALES MODULE APIS & AUTO BILL NUMBER
// ==========================================

function getCurrentFinancialYear() {
    const today = new Date();
    const month = today.getMonth() + 1;
    const year = today.getFullYear();
    
    let startYear = year;
    let endYear = year + 1;

    if (month < 4) {
        startYear = year - 1;
        endYear = year;
    }

    return `${startYear.toString().slice(-2)}-${endYear.toString().slice(-2)}`;
}

app.get('/api/sales/next-bill-no', async (req, res) => {
    try {
        const fy = getCurrentFinancialYear();
        const prefix = `S ${fy}/`;

        const query = "SELECT bill_no FROM sales WHERE bill_no LIKE ? ORDER BY id DESC LIMIT 1";
        const [results] = await db.query(query, [`${prefix}%`]);

        let nextNo = 1;
        if (results.length > 0 && results[0].bill_no) {
            const parts = results[0].bill_no.split('/');
            if (parts.length > 1) {
                nextNo = parseInt(parts[1]) + 1;
            }
        }
        res.json({ bill_no: `${prefix}${nextNo}` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/sales', async (req, res) => {
    try {
        const { order_id, token_no, table_id, gross_value, discount, net_payable, payment_mode, received_amount, balance_returned, items } = req.body;
        const isDirectBilling = !token_no; 

        const fy = getCurrentFinancialYear();
        const prefix = `S ${fy}/`;

        const [bResults] = await db.query("SELECT bill_no FROM sales WHERE bill_no LIKE ? ORDER BY id DESC LIMIT 1", [`${prefix}%`]);
        let nextNo = 1;
        if (bResults.length > 0 && bResults[0].bill_no) {
            const parts = bResults[0].bill_no.split('/');
            if (parts.length > 1) nextNo = parseInt(parts[1]) + 1;
        }
        const finalBillNo = `${prefix}${nextNo}`;

        if (isDirectBilling) {
            const todayDate = new Date().toISOString().slice(0, 10);
            const currentTime = new Date().toTimeString().slice(0, 8);

            const [tResults] = await db.query("SELECT token_no FROM orders WHERE order_date = ? ORDER BY id DESC LIMIT 1", [todayDate]);
            let nextToken = 1;
            if (tResults.length > 0 && tResults[0].token_no) {
                nextToken = parseInt(tResults[0].token_no) + 1;
            }
            const newTokNo = String(nextToken).padStart(3, '0');

            const [oResults] = await db.query("SELECT order_no FROM orders ORDER BY id DESC LIMIT 1");
            let nextOrderNo = "00001";
            if (oResults.length > 0 && oResults[0].order_no) {
                nextOrderNo = String(parseInt(oResults[0].order_no) + 1).padStart(5, '0');
            }

            const finalTableId = table_id || null;
            const insOrderQuery = `
                INSERT INTO orders 
                (order_pfx, order_no, token_no, order_date, order_time, waiter_id, table_id, order_type, gross_value, gst_percent, gst_value, net_value, status) 
                VALUES ('ORD', ?, ?, ?, ?, NULL, ?, 'NON_AC', ?, 0, 0, ?, 'COMPLETED')
            `;

            const [ioResult] = await db.query(insOrderQuery, [nextOrderNo, newTokNo, todayDate, currentTime, finalTableId, gross_value, net_payable]);
            const newOrderId = ioResult.insertId;

            const itemValues = items.map(i => [newOrderId, i.product_id, i.qty, i.rate, i.value]);
            await db.query("INSERT INTO order_items (order_id, product_id, qty, rate, value) VALUES ?", [itemValues]);

            // Save Sales
            const salesQuery = `
                INSERT INTO sales (bill_no, order_id, token_no, table_id, gross_value, discount, net_payable, payment_mode, received_amount, balance_returned, sales_date)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
            `;
            const [sResult] = await db.query(salesQuery, [finalBillNo, newOrderId, newTokNo, table_id, gross_value, discount, net_payable, payment_mode, received_amount, balance_returned]);

            res.json({ success: true, sales_id: sResult.insertId, bill_no: finalBillNo });

            setTimeout(() => {
                triggerCustomerBillPrint(newOrderId);
                triggerKitchenKOTPrint(newOrderId);
            }, 500);

        } else {
            const salesQuery = `
                INSERT INTO sales (bill_no, order_id, token_no, table_id, gross_value, discount, net_payable, payment_mode, received_amount, balance_returned, sales_date)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
            `;
            const [sResult] = await db.query(salesQuery, [finalBillNo, order_id, token_no, table_id, gross_value, discount, net_payable, payment_mode, received_amount, balance_returned]);

            if (order_id) {
                await db.query("UPDATE orders SET status = 'COMPLETED' WHERE id = ?", [order_id]);
            }

            res.json({ success: true, sales_id: sResult.insertId, bill_no: finalBillNo });

            setTimeout(() => {
                if (order_id) triggerCustomerBillPrint(order_id);
            }, 500);
        }
    } catch (err) {
        console.error("Sales Save Error:", err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/sales', async (req, res) => {
    try {
        const { from_date, to_date } = req.query;
        let query = `
            SELECT s.*, IFNULL(t.table_no, 'Counter') as table_no 
            FROM sales s 
            LEFT JOIN restaurant_tables t ON s.table_id = t.id
        `;
        const params = [];

        if (from_date && to_date) {
            query += ` WHERE DATE(s.sales_date) BETWEEN ? AND ? `;
            params.push(from_date, to_date);
        }
        query += ` ORDER BY s.id DESC`;

        const [results] = await db.query(query, params);
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/sales/:id', async (req, res) => {
    const connection = await db.getConnection();
    try {
        const salesId = req.params.id;

        const [salesRows] = await connection.query(
            "SELECT order_id, token_no FROM sales WHERE id = ?", 
            [salesId]
        );

        if (salesRows.length === 0) {
            connection.release();
            return res.status(404).json({ error: "Sales bill not found!" });
        }

        const { order_id } = salesRows[0];

        await connection.beginTransaction();

        await connection.query("DELETE FROM sales WHERE id = ?", [salesId]);

        if (order_id) {
            const [orderRows] = await connection.query(
                "SELECT order_type, waiter_id FROM orders WHERE id = ?", 
                [order_id]
            );

            if (orderRows.length > 0 && (!orderRows[0].waiter_id || orderRows[0].order_type === 'DIRECT')) {
                await connection.query("DELETE FROM order_items WHERE order_id = ?", [order_id]);
                await connection.query("DELETE FROM orders WHERE id = ?", [order_id]);
            } else {
                await connection.query(
                    "UPDATE orders SET status = 'PENDING' WHERE id = ?", 
                    [order_id]
                );
            }
        }

        await connection.commit();
        res.json({ message: "Sales bill deleted and order status updated successfully!" });

    } catch (err) {
        await connection.rollback();
        console.error("Error deleting sales:", err);
        res.status(500).json({ error: err.message });
    } finally {
        connection.release();
    }
});

app.get('/api/sales/reprint/:id', async (req, res) => {
    try {
        const salesId = req.params.id;
        const [results] = await db.query("SELECT order_id FROM sales WHERE id = ?", [salesId]);
        
        if (results.length === 0) return res.status(404).json({ error: "Sales bill not found" });
        
        const orderId = results[0].order_id;
        if (orderId) {
            triggerCustomerBillPrint(orderId);
            res.json({ message: "Re-print triggered successfully!" });
        } else {
            res.status(400).json({ error: "No associated order found for re-print" });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// சர்வர் போர்ட் ரன் செய்தல்
const PORT = 5000;
app.listen(PORT, () => {
    console.log(`Backend Server running on port ${PORT}`);
});
