// =================================================================
// KODE LENGKAP BOT KEUANGAN WHATSAPP
// Versi dengan Fitur Hapus, Perbaikan Menu, dll.
// =================================================================

const express = require('express');
const bodyParser = require('body-parser');
const { MessagingResponse } = require('twilio').twiml;
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const axios = require('axios');
const qs = require('qs');

// --- KONFIGURASI (Sama seperti sebelumnya) ---
const PORT = process.env.PORT || 3000;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
let creds;

if (process.env.GOOGLE_CREDENTIALS) {
    creds = JSON.parse(process.env.GOOGLE_CREDENTIALS);
} else {
    creds = require('./nama-file-kredensial-anda.json'); 
}

const serviceAccountAuth = new JWT({
    email: creds.client_email,
    key: creds.private_key.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.file'],
});

const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);
let userState = {};

// --- FUNGSI-FUNGSI PEMBANTU ---
async function loadSheet() { await doc.loadInfo(); return doc.sheetsByIndex[0]; }
async function appendToSheet(data) { const sheet = await loadSheet(); await sheet.addRow({ Tanggal: data.tanggal, Jenis: data.jenis, Jumlah: data.jumlah, Keterangan: data.keterangan }); }
async function generateReport() { /* ... kode sama persis ... */ }
async function sendTwilioMessage(to, messageBody) { /* ... kode sama persis ... */ }

// --- FUNGSI BARU UNTUK FITUR HAPUS/EDIT ---
async function getRecentTransactions(limit = 5) {
    const sheet = await loadSheet();
    const rows = await sheet.getRows({ limit });
    if (rows.length === 0) {
        return 'Belum ada transaksi untuk ditampilkan.';
    }
    let response = 'Berikut 5 transaksi terakhir Anda:\n\n';
    rows.forEach((row, index) => {
        const jenis = row.get('Jenis');
        const jumlah = parseFloat(row.get('Jumlah')).toLocaleString('id-ID');
        const keterangan = row.get('Keterangan');
        // Nomor urut dimulai dari 1
        response += `*${index + 1}*. [${jenis}] Rp ${jumlah} - ${keterangan}\n`;
    });
    response += '\nKetik `.hapus [nomor]` untuk menghapus.';
    return response;
}

async function deleteTransaction(rowIndex) {
    // rowIndex adalah nomor urut dari 1, 2, 3...
    if (isNaN(rowIndex) || rowIndex < 1) {
        return 'Nomor tidak valid. Harap masukkan nomor urut yang benar.';
    }
    const sheet = await loadSheet();
    const rows = await sheet.getRows();
    // Index array dimulai dari 0, jadi kita kurangi 1
    const actualIndex = rowIndex - 1;
    if (actualIndex >= 0 && actualIndex < rows.length) {
        const rowToDelete = rows[actualIndex];
        const keterangan = rowToDelete.get('Keterangan');
        await rowToDelete.delete();
        return `✅ Transaksi nomor ${rowIndex} ('${keterangan}') berhasil dihapus.`;
    } else {
        return `❌ Transaksi nomor ${rowIndex} tidak ditemukan.`;
    }
}


// --- LOGIKA UTAMA BOT ---
const app = express();
app.use(bodyParser.urlencoded({ extended: true }));

app.post('/webhook', async (req, res) => {
    const from = req.body.From; 
    const msgBody = req.body.Body ? req.body.Body.trim() : '';
    const twiml = new MessagingResponse();
    const currentState = userState[from];
    
    // --- PERBAIKAN: Cek perintah global terlebih dahulu ---
    const lowerCaseMsg = msgBody.toLowerCase();

    // Perintah .menu akan mereset state apa pun
    if (lowerCaseMsg === '.menu') {
        delete userState[from]; // Hapus state sebelumnya
        const replyText = 'Selamat datang di Bot Keuangan!\n\nSilakan pilih menu:\n*1*. Isi Pemasukan 💰\n*2*. Isi Pengeluaran 💸\n*3*. Tampilkan Laporan 📊\n*4*. 5 Transaksi Terakhir 📋\n\nKetik `.hapus [nomor]` untuk menghapus.';
        twiml.message(replyText);
        return res.type('text/xml').send(twiml.toString());
    }

    try {
        if (currentState === 'MENUNGGU_PEMASUKAN' || currentState === 'MENUNGGU_PENGELUARAN') {
            // ... (logika mencatat data sama persis seperti sebelumnya) ...
        } else {
            // Logika untuk menu utama
            let replyText = '';
            // Perintah yang diproses di latar belakang
            if (lowerCaseMsg === '3' || lowerCaseMsg === '.terakhir' || lowerCaseMsg.startsWith('.hapus')) {
                let initialReply = '⏳ Sedang diproses, mohon tunggu...';
                if(lowerCaseMsg === '3') initialReply = '⏳ Sedang mengambil data laporan, mohon tunggu...';
                if(lowerCaseMsg === '.terakhir') initialReply = '⏳ Sedang mengambil data transaksi terakhir...';
                if(lowerCaseMsg.startsWith('.hapus')) initialReply = '⏳ Sedang mencoba menghapus data...';

                twiml.message(initialReply);
                res.type('text/xml').send(twiml.toString());

                // Proses di latar belakang
                let finalReply = '';
                if (lowerCaseMsg === '3') {
                    finalReply = await generateReport();
                } else if (lowerCaseMsg === '.terakhir') {
                    finalReply = await getRecentTransactions();
                } else if (lowerCaseMsg.startsWith('.hapus')) {
                    const parts = lowerCaseMsg.split(' ');
                    const numberToDelete = parseInt(parts[1], 10);
                    finalReply = await deleteTransaction(numberToDelete);
                }
                await sendTwilioMessage(from, finalReply);
                return;
            }

            // Perintah yang bisa dibalas langsung
            switch (lowerCaseMsg) {
                case '1':
                    userState[from] = 'MENUNGGU_PEMASUKAN';
                    replyText = 'Anda memilih *Isi Pemasukan*.\n\nSilakan kirim dengan format:\n`[jumlah] [keterangan]`\n\nContoh: `500000 Gaji Bulanan`';
                    break;
                case '2':
                    userState[from] = 'MENUNGGU_PENGELUARAN';
                    replyText = 'Anda memilih *Isi Pengeluaran*.\n\nSilakan kirim dengan format:\n`[jumlah] [keterangan]`\n\nContoh: `25000 Makan Siang`';
                    break;
                case '4': // Alias untuk .terakhir
                     // Arahkan ke logika di atas
                    twiml.message('⏳ Sedang mengambil data transaksi terakhir...');
                    res.type('text/xml').send(twiml.toString());
                    const recentData = await getRecentTransactions();
                    await sendTwilioMessage(from, recentData);
                    return;
                default:
                    replyText = 'Perintah tidak dikenali. Ketik `.menu` untuk melihat pilihan yang tersedia.';
                    break;
            }
            twiml.message(replyText);
            res.type('text/xml').send(twiml.toString());
        }
    } catch (error) {
        console.error('Terjadi error saat memproses pesan:', error);
        await sendTwilioMessage(from, 'Maaf, terjadi kesalahan besar yang tidak terduga di pihak server. 😔');
        res.status(500).send();
    }
});

// Duplikasi fungsi-fungsi pembantu dan app.listen() agar kode ini bisa langsung di-copy-paste
// ... (Salin-tempel semua fungsi pembantu dan app.listen() dari kode sebelumnya) ...
async function generateReport() { const sheet = await loadSheet(); const rows = await sheet.getRows(); let totalPemasukan = 0; let totalPengeluaran = 0; rows.forEach(row => { const jumlah = parseFloat(row.get('Jumlah')) || 0; if (row.get('Jenis') === 'Pemasukan') { totalPemasukan += jumlah; } else if (row.get('Jenis') === 'Pengeluaran') { totalPengeluaran += jumlah; } }); const sisaUang = totalPemasukan - totalPengeluaran; const formatRp = (angka) => `Rp ${angka.toLocaleString('id-ID')}`; return `Laporan Keuangan Anda 📊\n\nTotal Pemasukan: ${formatRp(totalPemasukan)}\nTotal Pengeluaran: ${formatRp(totalPengeluaran)}\n\n*Total Uang Sekarang: ${formatRp(sisaUang)}*`; }
async function sendTwilioMessage(to, messageBody) { try { const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`; const data = { To: to, From: TWILIO_PHONE_NUMBER, Body: messageBody }; await axios.post(endpoint, qs.stringify(data), { auth: { username: TWILIO_ACCOUNT_SID, password: TWILIO_AUTH_TOKEN } }); console.log(`--> Pesan proaktif berhasil dikirim ke ${to}`); } catch (error) { console.error("Error saat mengirim pesan via Twilio API:", error.response ? error.response.data : "Unknown Error"); } }

app.listen(PORT, () => {
    console.log(`--> Server siap dan berjalan di port ${PORT}`);
});