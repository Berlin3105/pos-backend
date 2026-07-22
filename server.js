const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json()); // JSON டேட்டாவை படிக்க

const multer = require('multer');
const path = require('path');
const fs = require('fs');

const { getPrinters } = require('pdf-to-printer');
const pdf = require('html-pdf');

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
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',      // உங்க MySQL யூசர்நேம் (வழக்கமாக root)
    password: 'root',      // உங்க MySQL பாஸ்வேர்ட் (இல்லைனா காலியாக விடவும்)
    database: 'jb_pos_db'
});

db.connect((err) => {
    if (err) {
        console.error('Database connection failed: ' + err.stack);
        return;
    }
    console.log('Connected to MySQL Database successfully.');
});

// ====================================================================
// 🔐 Node.js Backend Login Controller (அசின்்க்ரோனஸ் எர்ரர் சரிசெய்யப்பட்டது)
// ====================================================================
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // 💡 இங்க சாதாரண db.query-க்கு பதிலா .promise().query() பயன்படுத்தியிருக்கோம் தலைவா!
    const [rows] = await db.promise().query(
      "SELECT id, username, role, linked_waiters FROM users WHERE username = ? AND password = ?", 
      [username, password]
    );

    if (rows && rows.length > 0) {
      const user = rows[0];
      
      // டேட்டாபேஸிலிருந்து வரும் JSON ஸ்ட்ரிங்கை ஃபிரண்ட்-எண்டிற்காக அரே-வாக மாற்றி அனுப்புகிறோம்
      let linkedWaitersArray = [];
      if (user.linked_waiters) {
        try {
          linkedWaitersArray = typeof user.linked_waiters === 'string' 
            ? JSON.parse(user.linked_waiters) 
            : user.linked_waiters;
        } catch (e) {
          // ஒருவேளை கமா பிரிக்கப்பட்ட ஸ்ட்ரிங்காக இருந்தால் (எ.கா: "1,2")
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
    console.error("Login API Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 1. புதிய லெட்ஜர் ஐடி தானாக உருவாக்க (Get Next Auto Ledger ID)
app.get('/api/ledgers/next-id', (req, res) => {
    const currentYear = new Date().getFullYear().toString().slice(-2); // 2026 -> "26"
    const idPrefix = `ID${currentYear}/`;

    // இந்த வருடத்தின் அதிகபட்ச ஐடியைக் கண்டறியும் கொரி
    const query = "SELECT ledger_id FROM ledgers WHERE ledger_id LIKE ? ORDER BY id DESC LIMIT 1";
    db.query(query, [`${idPrefix}%`], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });

        let nextNumber = 1;
        if (results.length > 0) {
            const lastId = results[0].ledger_id; // எ.கா: "ID26/5"
            const lastNumber = parseInt(lastId.split('/')[1]); // "5"
            nextNumber = lastNumber + 1;
        }

        res.json({ nextId: `${idPrefix}${nextNumber}` });
    });
});

// 2. புதிய லெட்ஜர் சேமிக்க (Create Ledger)
app.post('/api/ledgers', (req, res) => {
    const { ledger_id, ledger_name, mobile_no, email_id, gstno, address } = req.body;
    const query = "INSERT INTO ledgers (ledger_id, ledger_name, mobile_no, email_id, gstno, address) VALUES (?, ?, ?, ?, ?, ?)";
    
    db.query(query, [ledger_id, ledger_name, mobile_no, email_id, gstno, address], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Ledger created successfully!" });
    });
});

// 3. அனைத்து லெட்ஜர்களையும் எடுக்க (Read All Ledgers)
app.get('/api/ledgers', (req, res) => {
    // [சரிசெய்யப்பட்டது]: அனைத்து விபரங்களும் ஃபிரண்ட் எண்டிற்கு கிடைக்க '*' பயன்படுத்தப்பட்டுள்ளது
    db.query("SELECT * FROM ledgers ORDER BY ledger_name ASC", (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// 4. லெட்ஜர் விபரங்களை மாற்றியமைக்க (Update Ledger)
app.put('/api/ledgers/:id', (req, res) => {
    const { id } = req.params;
    const { ledger_name, mobile_no, email_id, gstno, address } = req.body;
    const query = "UPDATE ledgers SET ledger_name=?, mobile_no=?, email_id=?, gstno=?, address=? WHERE id=?";

    db.query(query, [ledger_name, mobile_no, email_id, gstno, address, id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Ledger updated successfully!" });
    });
});

// 5. லெட்ஜரை நீக்க (Delete Ledger)
app.delete('/api/ledgers/:id', (req, res) => {
    const { id } = req.params;
    db.query("DELETE FROM ledgers WHERE id = ?", [id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Ledger deleted successfully!" });
    });
});

// ==========================================
// PRODUCT SETUP API MODULE
// ==========================================

// 1. விடுபட்ட அல்லது அடுத்த தயாரிப்பு குறியீட்டை எடுக்க (Get Next Unique Product Code)
app.get('/api/products/next-code', (req, res) => {
    const query = "SELECT product_code FROM products ORDER BY product_code ASC";
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });

        const existingCodes = results.map(r => r.product_code);
        let nextCode = 1;
        
        // வரிசையாகச் சரிபார்த்து விடுபட்ட முதல் எண்ணைக் கண்டறியும் (e.g., 1, 2, 4 என்றால் 3 வரும்)
        while (existingCodes.includes(nextCode)) {
            nextCode++;
        }
        res.json({ nextCode });
    });
});

// 2. புதிய தயாரிப்பைச் சேமிக்க (Create Product)
app.post('/api/products', (req, res) => {
    const { product_code, product_name, tamil_product_name, ac_rate, non_ac_rate, hsn_code, product_group, tamil_product_group, unit } = req.body;
    const query = `INSERT INTO products (product_code, product_name, tamil_product_name, ac_rate, non_ac_rate, hsn_code, product_group, tamil_product_group, unit) 
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    
    db.query(query, [product_code, product_name, tamil_product_name, ac_rate, non_ac_rate, hsn_code, product_group, tamil_product_group, unit], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Product created successfully!" });
    });
});

// 3. அனைத்து தயாரிப்புகளையும் எடுக்க (Read All Products)
app.get('/api/products', (req, res) => {
    db.query("SELECT * FROM products ORDER BY product_code ASC", (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// 4. தயாரிப்பு விபரங்களை மாற்றியமைக்க (Update Product)
app.put('/api/products/:id', (req, res) => {
    const { id } = req.params;
    const { product_name, tamil_product_name, ac_rate, non_ac_rate, hsn_code, product_group, tamil_product_group, unit } = req.body;
    const query = `UPDATE products SET product_name=?, tamil_product_name=?, ac_rate=?, non_ac_rate=?, hsn_code=?, product_group=?, tamil_product_group=?, unit=? WHERE id=?`;

    db.query(query, [product_name, tamil_product_name, ac_rate, non_ac_rate, hsn_code, product_group, tamil_product_group, unit, id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Product updated successfully!" });
    });
});

// 5. தயாரிப்பை நீக்க (Delete Product)
app.delete('/api/products/:id', (req, res) => {
    const { id } = req.params;
    db.query("DELETE FROM products WHERE id = ?", [id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Product deleted successfully!" });
    });
});


// 6. ஆங்கில தயாரிப்பு குழுக்களை மட்டும் எடுக்க (Get Unique English Groups)
app.get('/api/products/groups-en', (req, res) => {
    const query = "SELECT product_group FROM products WHERE product_group IS NOT NULL AND product_group != '' GROUP BY product_group";
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results.map(r => r.product_group));
    });
});

// 7. தமிழ் தயாரிப்பு குழுக்களை மட்டும் எடுக்க (Get Unique Tamil Groups)
app.get('/api/products/groups-ta', (req, res) => {
    const query = "SELECT tamil_product_group FROM products WHERE tamil_product_group IS NOT NULL AND tamil_product_group != '' GROUP BY tamil_product_group";
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results.map(r => r.tamil_product_group));
    });
});

// 1. சிஸ்டமில் உள்ள அனைத்து பிரிண்டர்களின் பெயர்களை மட்டும் எடுத்து அனுப்பும் புதிய API
app.get('/api/system-printers', async (req, res) => {
    try {
        const printers = await getPrinters(); //[cite: 12]
        const printerNames = printers.map(p => p.name);
        res.json(printerNames);
    } catch (err) {
        console.error("Error fetching system printers:", err);
        res.json([]); // எரர் வந்தால் காலியாக அனுப்பும்
    }
});

// 2. [மாற்றப்பட்ட API]: கம்பெனியைச் சேமிக்க அல்லது புதுப்பிக்க (Save or Update Single Company)
app.post('/api/companies/save-single', upload.single('image'), (req, res) => { //[cite: 12]
    const { 
        id, company_name, address1, address2, address3, state, state_code, 
        mobile_no, phone_no, gst_no, email_no, cash_in_hand_account, sales_account, existing_image,
        kot_printer, sales_printer, report_printer, kot_lang, sales_lang // 👈 புதிய ஃபீல்டுகள்
    } = req.body; //[cite: 12]
    
    let image_path = req.file ? `uploads/${req.file.filename}` : (existing_image || null); //[cite: 12]

    const cashAccountValue = (cash_in_hand_account && cash_in_hand_account !== 'null' && cash_in_hand_account !== '') ? cash_in_hand_account : null; //[cite: 12]
    const salesAccountValue = (sales_account && sales_account !== 'null' && sales_account !== '') ? sales_account : null; //[cite: 12]

    if (id && id !== 'null' && id !== '') { //[cite: 12]
        // ஏற்கனவே கம்பெனி இருந்தால் UPDATE செய்கிறோம்
        const query = `
            UPDATE companies SET 
            company_name=?, address1=?, address2=?, address3=?, state=?, state_code=?, mobile_no=?, phone_no=?, gst_no=?, email_no=?, image_path=?, cash_in_hand_account=?, sales_account=?,
            kot_printer=?, sales_printer=?, report_printer=?, kot_lang=?, sales_lang=? 
            WHERE id=?
        `; //[cite: 12]
        db.query(query, [
            company_name, address1, address2, address3, state, state_code, mobile_no, phone_no, gst_no, email_no, image_path, cashAccountValue, salesAccountValue, 
            kot_printer, sales_printer, report_printer, kot_lang, sales_lang, id // 👈 புதிய வேல்யூஸ்
        ], (err, result) => { //[cite: 12]
            if (err) return res.status(500).json({ error: err.message }); //[cite: 12]
            res.json({ message: "Company Setup Updated Successfully!" }); //[cite: 12]
        });
    } else {
        // புதிய பதிவு என்றால் INSERT செய்கிறோம்
        const query = `
            INSERT INTO companies 
            (company_name, address1, address2, address3, state, state_code, mobile_no, phone_no, gst_no, email_no, image_path, cash_in_hand_account, sales_account, kot_printer, sales_printer, report_printer, kot_lang, sales_lang) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `; //[cite: 12]
        db.query(query, [
            company_name, address1, address2, address3, state, state_code, mobile_no, phone_no, gst_no, email_no, image_path, cashAccountValue, salesAccountValue,
            kot_printer, sales_printer, report_printer, kot_lang, sales_lang // 👈 புதிய வேல்யூஸ்
        ], (err, result) => { //[cite: 12]
            if (err) return res.status(500).json({ error: err.message }); //[cite: 12]
            res.json({ message: "Company Setup Saved Successfully!" }); //[cite: 12]
        });
    }
});

// 3. [மாற்றப்பட்ட API]: கம்பெனி விபரங்களை எடுக்கும் போது புதிய காலம்களும் தானாக வரும்
app.get('/api/companies/single', (req, res) => { //[cite: 12]
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
    `; //[cite: 12]
    db.query(query, (err, results) => { //[cite: 12]
        if (err) return res.status(500).json({ error: err.message }); //[cite: 12]
        res.json(results[0] || null); //[cite: 12]
    });
});

// ==========================================
// WAITER SETUP APIS
// ==========================================

// 1. அடுத்த Waiter ID ஆட்டோ-இன்க்ரிமென்ட் வடிவில் பெற (Get Next Waiter ID)
app.get('/api/waiters/next-id', (req, res) => {
    db.query("SELECT waiter_id FROM waiters ORDER BY id DESC LIMIT 1", (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        
        let nextId = "W-001"; // முதல் பதிவாக இருந்தால்
        if (results.length > 0) {
            const lastId = results[0].waiter_id; // எ.கா: W-001
            const lastNum = parseInt(lastId.split('-')[1]); // 001 -> 1
            const nextNum = lastNum + 1;
            nextId = `W-${String(nextNum).padStart(3, '0')}`; // W-002
        }
        res.json({ nextId });
    });
});

// 2. அனைத்து Waiters பட்டியலையும் எடுக்க (Get All Waiters)
app.get('/api/waiters', (req, res) => {
    db.query("SELECT * FROM waiters ORDER BY id DESC", (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// 3. புதிய Waiter-ஐச் சேர்க்க (Create Waiter)
app.post('/api/waiters', (req, res) => {
    const { waiter_id, waiter_name, tamil_waiter_name } = req.body;
    const query = "INSERT INTO waiters (waiter_id, waiter_name, tamil_waiter_name) VALUES (?, ?, ?)";
    db.query(query, [waiter_id, waiter_name, tamil_waiter_name || null], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Waiter Saved Successfully!" });
    });
});

// 4. Waiter விபரங்களை மாற்றியமைக்க (Update Waiter)
app.put('/api/waiters/:id', (req, res) => {
    const { id } = req.params;
    const { waiter_name, tamil_waiter_name } = req.body;
    const query = "UPDATE waiters SET waiter_name = ?, tamil_waiter_name = ? WHERE id = ?";
    db.query(query, [waiter_name, tamil_waiter_name || null, id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Waiter Updated Successfully!" });
    });
});

// 5. Waiter-ஐ நீக்க (Delete Waiter)
app.delete('/api/waiters/:id', (req, res) => {
    const { id } = req.params;
    db.query("DELETE FROM waiters WHERE id = ?", [id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Waiter Deleted Successfully!" });
    });
});

// ==========================================
// TABLE SETUP APIS
// ==========================================

// 1. அனைத்து டேபிள்களின் பட்டியலையும் எடுக்க (Get All Tables)
app.get('/api/tables', (req, res) => {
    db.query("SELECT * FROM restaurant_tables ORDER BY CAST(table_no AS UNSIGNED) ASC, table_no ASC", (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// 2. புதிய Table-ஐச் சேர்க்க (Create Table with Duplicate Check)
app.post('/api/tables', (req, res) => {
    const { table_no } = req.body;
    
    // ஏற்கனவே இந்த டேபிள் நம்பர் இருக்கிறதா என்று செக் செய்கிறோம்
    db.query("SELECT * FROM restaurant_tables WHERE table_no = ?", [table_no], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (results.length > 0) {
            return res.status(400).json({ error: "Table Number already exists!" });
        }
        
        const query = "INSERT INTO restaurant_tables (table_no) VALUES (?)";
        db.query(query, [table_no], (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: "Table Saved Successfully!" });
        });
    });
});

// 3. Table விபரங்களை மாற்றியமைக்க (Update Table with Duplicate Check)
app.put('/api/tables/:id', (req, res) => {
    const { id } = req.params;
    const { table_no } = req.body;
    
    // எடிட் செய்யும் போது, தனது சொந்த ஐடியைத் தவிர வேறு யாருக்கும் இதே டேபிள் நம்பர் இருக்கிறதா என செக் செய்கிறோம்
    db.query("SELECT * FROM restaurant_tables WHERE table_no = ? AND id != ?", [table_no, id], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (results.length > 0) {
            return res.status(400).json({ error: "Table Number already exists!" });
        }
        
        const query = "UPDATE restaurant_tables SET table_no = ? WHERE id = ?";
        db.query(query, [table_no, id], (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: "Table Updated Successfully!" });
        });
    });
});

// 4. Table-ஐ நீக்க (Delete Table)
app.delete('/api/tables/:id', (req, res) => {
    const { id } = req.params;
    db.query("DELETE FROM restaurant_tables WHERE id = ?", [id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Table Deleted Successfully!" });
    });
});

// ==========================================
// ORDER POS SETUP APIS
// ==========================================

// அடுத்த Order No பெற (இது தொடர்ந்து ஏறிக்கொண்டே போகும் பில் நம்பர்)
app.get('/api/orders/next-no', (req, res) => {
    // தேதியைப் பார்க்காமல் டேட்டாபேஸின் கடைசி பில் எண்ணை மட்டும் எடுக்கிறோம்
    db.query("SELECT order_no FROM orders ORDER BY id DESC LIMIT 1", (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        let nextNo = 1;
        if (results.length > 0) {
            const lastNo = parseInt(results[0].order_no);
            nextNo = lastNo + 1; // தொடர்ந்து கூட்டப்படுகிறது
        }
        res.json({ nextNo: String(nextNo).padStart(5, '0') }); // எ.கா: 00043
    });
});

app.post('/api/orders', (expressReq, expressRes) => {
    const { order_pfx, order_no, order_date, order_time, waiter_id, table_id, order_type, gross_value, gst_percent, gst_value, net_value, items } = expressReq.body; //

    // POST /api/orders ஏபிஐ-க்குள் இந்த பகுதியை மட்டும் மாற்றவும்:
const tokenQuery = "SELECT token_no FROM orders WHERE order_date = ? ORDER BY id DESC LIMIT 1";

db.query(tokenQuery, [order_date], (tokenErr, tokenResults) => {
    if (tokenErr) return expressRes.status(500).json({ error: tokenErr.message });

    let nextToken = 1; // இன்று முதல் பில் என்றால் டோக்கன் 1
    
    if (tokenResults.length > 0 && tokenResults[0].token_no) {
        const lastTokenParsed = parseInt(tokenResults[0].token_no);
        // ஒருவேளை பழைய டேட்டா ஏதேனும் தவறாக இருந்தால் பாதுகாப்பிற்கு ஒரு செக்:
        if (!isNaN(lastTokenParsed)) {
            nextToken = lastTokenParsed + 1;
        }
    }
    
    // 3 இலக்க டோக்கன் நம்பர் (எ.கா: 001, 002)
    const finalTokenNo = String(nextToken).padStart(3, '0');

        db.beginTransaction(err => { //
            if (err) return expressRes.status(500).json({ error: err.message }); //

            // 🎯 இங்க 'token_no' காலமையும் சேர்த்து இன்செர்ட் செய்கிறோம்
            const orderQuery = "INSERT INTO orders (order_pfx, order_no, token_no, order_date, order_time, waiter_id, table_id, order_type, gross_value, gst_percent, gst_value, net_value) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"; //
            
            db.query(orderQuery, [order_pfx, order_no, finalTokenNo, order_date, order_time, waiter_id, table_id, order_type, gross_value, gst_percent, gst_value, net_value], (err, result) => { //
                if (err) { //
                    return db.rollback(() => expressRes.status(500).json({ error: err.message })); //
                }
                
                const orderId = result.insertId; //
                const itemQuery = "INSERT INTO order_items (order_id, product_id, qty, rate, value) VALUES ?"; //
                const itemValues = items.map(item => [orderId, item.product_id, item.qty, item.rate, item.value]); //

                db.query(itemQuery, [itemValues], (err) => { //
                    if (err) { //
                        return db.rollback(() => expressRes.status(500).json({ error: err.message })); //
                    }

                    db.commit(err => { //
                        if (err) return db.rollback(() => expressRes.status(500).json({ error: err.message })); //
                        
                        const { is_print } = expressReq.body; //

                        expressRes.json({ 
                            message: "Order Processed Successfully!", 
                            orderId: orderId 
                        }); //

                        if (is_print === true || is_print === undefined) { //
                            setTimeout(() => { //
                                triggerCustomerBillPrint(orderId); //
                                triggerKitchenKOTPrint(orderId); //
                            }, 500); //
                        }
                    });
                });
            });
        });
    });
});

// 3. அனைத்து ஆர்டர் பட்டியல் (List View வித் டேட் ஃபில்டர்)[cite: 18]
app.get('/api/orders', (req, res) => {
    const { from_date, to_date } = req.query; // ஃபிரண்ட் எண்டில் இருந்து வரும் தேதிகள்[cite: 18]
    
    let query = `
        SELECT 
            o.*, 
            IFNULL(w.waiter_name, 'Unknown') AS waiter_name, 
            IFNULL(t.table_no, 'N/A') AS table_no 
        FROM orders o 
        LEFT JOIN waiters w ON o.waiter_id = w.id 
        LEFT JOIN restaurant_tables t ON o.table_id = t.id `; //[cite: 18]

    const queryParams = [];

    // ஒருவேளை தேதிகள் அனுப்பப்பட்டிருந்தால் மட்டும் WHERE கண்டிஷன் சேர்க்கிறோம்[cite: 18]
    if (from_date && to_date) {
        query += ` WHERE o.order_date BETWEEN ? AND ? `;
        queryParams.push(from_date, to_date);
    }

    query += ` ORDER BY o.id DESC`;

    db.query(query, queryParams, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// 4. ஆர்டர் நீக்குதல்
app.delete('/api/orders/:id', (req, res) => {
    db.query("DELETE FROM orders WHERE id = ?", [req.params.id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Order Deleted Successfully!" });
    });
});

// 🖨️ 1. CUSTOMER BILL - தொகையுடன் (Amount) சிஸ்டத்தின் Default பிரிண்டரில் பிரிண்ட் ஆகும் ஃபங்க்ஷன்
function triggerCustomerBillPrint(orderId) {
    db.query("SELECT * FROM companies LIMIT 1", (err, companyResults) => {
        if (err || companyResults.length === 0) return;
        const company = companyResults[0];

        const orderQuery = `
            SELECT o.*, w.waiter_name, w.tamil_waiter_name, o.table_id as table_no, o.token_no 
            FROM orders o
            LEFT JOIN waiters w ON o.waiter_id = w.id
            WHERE o.id = ?`;

        db.query(orderQuery, [orderId], (err, orderResults) => {
            if (err || orderResults.length === 0) return;
            const order = orderResults[0];

            const itemsQuery = `
                SELECT oi.*, p.product_name, p.tamil_product_name 
                FROM order_items oi
                JOIN products p ON oi.product_id = p.id
                WHERE oi.order_id = ?`;

            db.query(itemsQuery, [orderId], (err, itemResults) => {
                if (err) return;

                const totalQty = itemResults.reduce((sum, item) => sum + Number(item.qty), 0);
                const printLanguage = company.sales_lang || 'English';
                const displayWaiter = (printLanguage === 'Tamil' && order.tamil_waiter_name) ? order.tamil_waiter_name : order.waiter_name;

                // 📄 வாடிக்கையாளர் பில்லுக்கான முழு விபரங்கள் அடங்கிய HTML (Amount, GST, Net Total உடன்)
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

                    // ⭐ printer ஆப்ஷன் கொடுக்காததால், இது கம்ப்யூட்டரின் "Default Printer"-க்கு நேரடியாகப் போகும் நண்பா!
                    const { print } = require('pdf-to-printer');
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
            });
        });
    });
}

// 🖨️ 2. KOT BILL - தொகை இல்லாமல் (No Amount) கிச்சன் பிரிண்டருக்கு மட்டும் போகும் ஃபங்க்ஷன்
function triggerKitchenKOTPrint(orderId) {
    db.query("SELECT * FROM companies LIMIT 1", (err, companyResults) => {
        if (err || companyResults.length === 0) return;
        const company = companyResults[0];

        const targetPrinter = company.kot_printer;
        const printLanguage = company.kot_lang || 'English';

        if (!targetPrinter) {
            console.log("No KOT printer configured. Skipping Kitchen Print.");
            return;
        }

        const orderQuery = `
            SELECT o.*, w.waiter_name, w.tamil_waiter_name, o.table_id as table_no 
            FROM orders o
            LEFT JOIN waiters w ON o.waiter_id = w.id
            WHERE o.id = ?`;

        db.query(orderQuery, [orderId], (err, orderResults) => {
            if (err || orderResults.length === 0) return;
            const order = orderResults[0];

            const itemsQuery = `
                SELECT oi.*, p.product_name, p.tamil_product_name 
                FROM order_items oi
                JOIN products p ON oi.product_id = p.id
                WHERE oi.order_id = ?`;

            db.query(itemsQuery, [orderId], (err, itemResults) => {
                if (err) return;

                const totalQty = itemResults.reduce((sum, item) => sum + Number(item.qty), 0);
                const displayWaiter = (printLanguage === 'Tamil' && order.tamil_waiter_name) ? order.tamil_waiter_name : order.waiter_name;

                // 📄 கிச்சனுக்கான எளிமையான HTML (விலை விபரங்கள் கிடையாது)
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
                    const displayProductName = (printLanguage === 'Tamil' && item.tamil_product_name) ? item.tamil_product_name : item.product_name;
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

                pdf.create(htmlContent, options).toFile(tempPdfPath, (pdfErr) => {
                    if (pdfErr) return;

                    getPrinters().then(allPrinters => {
                        const printerExists = allPrinters.some(p => p.name === targetPrinter);
                        if (printerExists) {
                            const { print } = require('pdf-to-printer');
                            print(tempPdfPath, { printer: targetPrinter })
                                .then(() => {
                                    if(fs.existsSync(tempPdfPath)) fs.unlinkSync(tempPdfPath);
                                })
                                .catch(() => {
                                    if(fs.existsSync(tempPdfPath)) fs.unlinkSync(tempPdfPath);
                                });
                        } else {
                            if(fs.existsSync(tempPdfPath)) fs.unlinkSync(tempPdfPath);
                        }
                    });
                });
            });
        });
    });
}
// பழைய ஏபிஐ-க்கு பதிலாக இதை மாற்றிப் போடுங்கள் நண்பா
app.get('/api/product-groups', (req, res) => {
    // products டேபிளில் இருக்கும் குழுக்களை மட்டும் யுனிக்-ஆக எடுக்கிறோம்
    const query = `
        SELECT product_group AS name 
        FROM products 
        WHERE product_group IS NOT NULL AND product_group != '' 
        GROUP BY product_group 
        ORDER BY product_group ASC
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        
        // ஃபிரண்ட்-எண்டிற்கு id மற்றும் name ஜோடியாக அனுப்ப வேண்டும் என்பதால் Map செய்கிறோம்
        const formattedGroups = results.map((item, index) => ({
            id: index + 1, // தற்காலிக ஐடி
            name: item.name
        }));
        
        res.json(formattedGroups);
    });
});

// server.js ஃபைலின் கீழே உள்ள இந்த ஏபிஐ-ஐ மட்டும் இப்படி மாற்றுங்கள் நண்பா
app.get('/api/products', (req, res) => {
    // group_id-க்கு பதிலாக product_group என்று மாற்றப்பட்டுள்ளது
    db.query("SELECT id, product_name, product_group, ac_rate, non_ac_rate FROM products ORDER BY product_name ASC", (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// 1. ஒரு குறிப்பிட்ட ஆர்டரின் முழு விபரங்கள் மற்றும் அதன் ஐட்டங்களை எடிட் செய்ய எடுக்க
app.get('/api/orders/:id', (req, res) => {
    const orderId = req.params.id;
    
    // முதன்மை ஆர்டர் விபரம்
    db.query("SELECT * FROM orders WHERE id = ?", [orderId], (err, orderResults) => {
        if (err) return res.status(500).json({ error: err.message });
        if (orderResults.length === 0) return res.status(404).json({ message: "Order not found" });

        // அந்த ஆர்டருக்குள் இருக்கும் பொருட்கள் (Items)
        const itemQuery = `
            SELECT oi.*, p.product_name 
            FROM order_items oi
            JOIN products p ON oi.product_id = p.id
            WHERE oi.order_id = ?`;
            
        db.query(itemQuery, [orderId], (err, itemResults) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ order: orderResults[0], items: itemResults });
        });
    });
});

// 2. எடிட் செய்த ஆர்டரை டேட்டாபேஸில் அப்டேட் செய்ய (PUT Method)
app.put('/api/orders/:id', (req, res) => {
    const orderId = req.params.id;
    const { waiter_id, table_id, order_type, gross_value, gst_percent, gst_value, net_value, items } = req.body;

    db.beginTransaction(err => {
        if (err) return res.status(500).json({ error: err.message });

        // முதன்மை ஆர்டரை அப்டேட் செய்கிறோம்
        const updateOrderQuery = `
            UPDATE orders 
            SET waiter_id=?, table_id=?, order_type=?, gross_value=?, gst_percent=?, gst_value=?, net_value=? 
            WHERE id=?`;

        db.query(updateOrderQuery, [waiter_id, table_id, order_type, gross_value, gst_percent, gst_value, net_value, orderId], (err) => {
            if (err) return db.rollback(() => res.status(500).json({ error: err.message }));

            // பழைய பொருட்களை முதலில் நீக்குகிறோம்
            db.query("DELETE FROM order_items WHERE order_id = ?", [orderId], (err) => {
                if (err) return db.rollback(() => res.status(500).json({ error: err.message }));

                // புதிய திருத்தப்பட்ட பொருட்களைச் சேர்க்கிறோம்
                const insertItemQuery = "INSERT INTO order_items (order_id, product_id, qty, rate, value) VALUES ?";
                const itemValues = items.map(item => [orderId, item.product_id, item.qty, item.rate, item.value]);

                db.query(insertItemQuery, [itemValues], (err) => {
                    if (err) return db.rollback(() => res.status(500).json({ error: err.message }));

                    // POST மற்றும் PUT ஏபிஐ-ல் உள்ள db.commit-க்குள் இதை மாற்றிப் போடுங்கள் நண்பா:
                    db.commit(err => {
                        if (err) return db.rollback(() => res.status(500).json({ error: err.message }));
                        
                        const { is_print } = req.body;

                        res.json({ 
                            message: "Order Processed Successfully!", 
                            orderId: orderId 
                        });

                        // ⚡ ஒரே நேரத்தில் இரண்டு பிரிண்டர்களுக்கும் பிரிண்ட் கமாண்ட் போகிறது!
                        if (is_print === true || is_print === undefined) {
                            setTimeout(() => {
                                // 1. வாடிக்கையாளர் பில் தொகையுடன் (Default Printer-க்கு போகும்)
                                triggerCustomerBillPrint(orderId);
                                
                                // 2. சமையலறை KOT தொகை இல்லாமல் (Company Setup Printer-க்கு போகும்)
                                triggerKitchenKOTPrint(orderId);
                            }, 500);
                        }
                    });
                });
            });
        });
    });
});

// ==========================================
// USER PASSWORD & PERMISSION SETUP APIS
// ==========================================

// 1. அனைத்து பயனர்களையும் கிரிட்டில் (Grid) காட்ட தேவையான விபரங்களை எடுத்தல்
app.get('/api/setup/users', (req, res) => {
    // பாஸ்வேர்டை பாதுகாப்பிற்காக விடுத்து, மற்ற விபரங்களை எடுக்கிறோம்
    const query = "SELECT id, username, role, permitted_menus, linked_waiters FROM users ORDER BY username ASC";
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        
        // JSON ஸ்ட்ரிங்காக இருக்கும் மெனு மற்றும் வெயிட்டர் விபரங்களை மீண்டும் அரே-வாக (Array) மாற்றி அனுப்புகிறோம்
        const formattedUsers = results.map(user => ({
            ...user,
            permitted_menus: user.permitted_menus ? JSON.parse(user.permitted_menus) : [],
            linked_waiters: user.linked_waiters ? JSON.parse(user.linked_waiters) : []
        }));
        res.json(formattedUsers);
    });
});

// 2. புதிய யூசர் மற்றும் பெர்மிஷன்களைச் சேமிக்க (Create User with Permissions)
app.post('/api/setup/users', (req, res) => {
    const { username, password, role, permitted_menus, linked_waiters } = req.body;

    // ஏற்கனவே இந்த யூசர்நேம் இருக்கிறதா என்று செக் செய்கிறோம்
    db.query("SELECT id FROM users WHERE username = ?", [username], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        if (results.length > 0) {
            return res.status(400).json({ error: "Username already exists!" });
        }

        const query = "INSERT INTO users (username, password, role, permitted_menus, linked_waiters) VALUES (?, ?, ?, ?, ?)";
        
        // அரே டேட்டாக்களை JSON ஸ்ட்ரிங்காக மாற்றி டேட்டாபேஸில் சேமிக்கிறோம்
        db.query(query, [
            username, 
            password, 
            role, 
            JSON.stringify(permitted_menus || []), 
            JSON.stringify(linked_waiters || [])
        ], (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: "User Configuration Saved Successfully!" });
        });
    });
});

// 3. யூசர் பெர்மிஷன்களை எடிட் செய்து புதுப்பிக்க (Update User Permissions)
app.put('/api/setup/users/:id', (req, res) => {
    const { id } = req.params;
    const { username, password, role, permitted_menus, linked_waiters } = req.body;

    // பாஸ்வேர்ட் மாற்றப்பட்டிருந்தால் அதையும் சேர்த்து அப்டேட் செய்ய லாஜிக்
    let query, params;
    if (password && password.trim() !== "") {
        query = "UPDATE users SET username=?, password=?, role=?, permitted_menus=?, linked_waiters=? WHERE id=?";
        params = [username, password, role, JSON.stringify(permitted_menus), JSON.stringify(linked_waiters), id];
    } else {
        query = "UPDATE users SET username=?, role=?, permitted_menus=?, linked_waiters=? WHERE id=?";
        params = [username, role, JSON.stringify(permitted_menus), JSON.stringify(linked_waiters), id];
    }

    db.query(query, params, (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "User Configuration Updated Successfully!" });
    });
});

// 4. யூசரை நீக்க (Delete User)
app.delete('/api/setup/users/:id', (req, res) => {
    db.query("DELETE FROM users WHERE id = ?", [req.params.id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "User Deleted Successfully!" });
    });
});

// 🎟️ 1. Pending Tokens API (இன்று போடப்பட்ட முடிக்கப்படாத ஆர்டர்களை மட்டும் எடுக்க)
app.get('/api/orders/pending-tokens', (req, res) => {
    const query = `
        SELECT o.id, o.token_no, o.net_value, o.table_id, t.table_no, w.waiter_name 
        FROM orders o
        LEFT JOIN restaurant_tables t ON o.table_id = t.id
        LEFT JOIN waiters w ON o.waiter_id = w.id
        WHERE o.id NOT IN (SELECT order_id FROM sales WHERE order_id IS NOT NULL)
          AND (o.status IS NULL OR o.status != 'COMPLETED')
        ORDER BY o.id DESC
    `;
    db.query(query, (err, results) => {
        if (err) {
            console.error("Error fetching pending tokens:", err);
            return res.status(500).json({ error: err.message });
        }
        res.json(results);
    });
});

// 💳 Sales Entry Save API (Pending Token இல்லையென்றாலும் புது Token தானாக உருவாகும்)
app.post('/api/sales', (req, res) => {
    const { order_id, token_no, table_id, gross_value, discount, net_payable, payment_mode, received_amount, balance_returned, items } = req.body;

    const saveSalesProcess = (finalTokenNo, finalOrderId) => {
        const query = `
          INSERT INTO sales (order_id, token_no, table_id, gross_value, discount, net_payable, payment_mode, received_amount, balance_returned, sales_date)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `;

        db.query(query, [finalOrderId, finalTokenNo, table_id, gross_value, discount, net_payable, payment_mode, received_amount, balance_returned], (err, salesResult) => {
            if (err) {
                console.error("Error saving sales:", err);
                return res.status(500).json({ error: err.message });
            }

            if (finalOrderId) {
                db.query(`UPDATE orders SET status = 'COMPLETED' WHERE id = ?`, [finalOrderId], (updateErr) => {
                    if (updateErr) console.error("Error updating order status:", updateErr);
                });
            }

            res.json({ success: true, sales_id: salesResult.insertId, token_no: finalTokenNo });
        });
    };

    // ஒருவேளை Pending Token இல்லாமல் நேரடியாக SalesCounter-ல் பில் போட்டால்:
    if (!token_no) {
        const todayDate = new Date().toISOString().slice(0, 10);
        db.query("SELECT token_no FROM orders WHERE order_date = ? ORDER BY id DESC LIMIT 1", [todayDate], (tErr, tResults) => {
            let nextToken = 1;
            if (tResults && tResults.length > 0 && tResults[0].token_no) {
                nextToken = parseInt(tResults[0].token_no) + 1;
            }
            const generatedToken = String(nextToken).padStart(3, '0');
            saveSalesProcess(generatedToken, order_id || null);
        });
    } else {
        saveSalesProcess(token_no, order_id);
    }
});

// சர்வர் போர்ட் ரன் செய்தல்
const PORT = 5000;
app.listen(PORT, () => {
    console.log(`Backend Server running on port ${PORT}`);
});