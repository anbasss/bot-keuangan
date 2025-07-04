// =================================================================
// KODE LENGKAP BOT KEUANGAN WHATSAPP
// Versi Final - Twilio & Railway dengan Konfirmasi 2 Pesan
// =================================================================

const express = require('express');
const bodyParser = require('body-parser');
const { MessagingResponse } = require('twilio').twiml;
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const axios = require('axios');
const qs = require('qs');

// --- KONFIGURASI DARI ENVIRONMENT VARIABLES ---
const PORT = process.env.PORT || 3000;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
let creds;

if (process.env.GOOGLE_CREDENTIALS) {
    creds = JSON.parse(process.env.GOOGLE_CREDENTIALS);
} else {
    // Sesuaikan nama file ini jika Anda testing di komputer lokal
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
async function generateReport() { const sheet = await loadSheet(); const rows = await sheet.getRows(); let totalPemasukan = 0; let totalPengeluaran = 0; rows.forEach(row => { const jumlah = parseFloat(row.get('Jumlah')) || 0; if (row.get('Jenis') === 'Pemasukan') { totalPemasukan += jumlah; } else if (row.get('Jenis') === 'Pengeluaran') { totalPengeluaran += jumlah; } }); const sisaUang = totalPemasukan - totalPengeluaran; const formatRp = (angka) => `Rp ${angka.toLocaleString('id-ID')}`; return `Laporan Keuangan Anda 📊\n\nTotal Pemasukan: ${formatRp(totalPemasukan)}\nTotal Pengeluaran: ${formatRp(totalPengeluaran)}\n\n*Total Uang Sekarang: ${formatRp(sisaUang)}*`; }

// Fungsi untuk mengirim pesan baru via Twilio API
async function sendTwilioMessage(to, messageBody) {
    console.log(`--> Mencoba mengirim pesan proaktif ke ${to}`);
    try {
        const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
        const data = { To: to, From: TWILIO_PHONE_NUMBER, Body: messageBody };
        await axios.post(endpoint, qs.stringify(data), { auth: { username: TWILIO_ACCOUNT_SID, password: TWILIO_AUTH_TOKEN } });
        console.log(`--> Pesan proaktif berhasil dikirim ke ${to}`);
    } catch (error) {
        console.error("Error saat mengirim pesan via Twilio API:", error.response ? error.response.data : "Unknown Error");
    }
}

// --- LOGIKA UTAMA BOT ---
const app = express();
app.use(bodyParser.urlencoded({ extended: true }));

app.post('/webhook', async (req, res) => {
    console.log('--- PESAN BARU DITERIMA DI /webhook ---');
    const from = req.body.From; 
    const msgBody = req.body.Body ? req.body.Body.trim() : '';
    console.log('Pengirim:', from, '| Isi Pesan:', msgBody);

    const twiml = new MessagingResponse();
    const currentState = userState[from];
    
    try {
        if (currentState === 'MENUNGGU_PEMASUKAN' || currentState === 'MENUNGGU_PENGELUARAN') {
            const parts = msgBody.split(' ');
            const jumlah = parseInt(parts[0], 10);
            const keterangan = parts.slice(1).join(' ');

            if (!isNaN(jumlah) && jumlah > 0 && keterangan) {
                // 1. Balas dulu dengan pesan "sedang diproses" secara instan
                const processingMessage = `⏳ Siap! Data _'${jumlah} ${keterangan}'_ sedang diproses...`;
                twiml.message(processingMessage);
                res.type('text/xml').send(twiml.toString());

                // 2. Lakukan tugas berat di latar belakang SETELAH membalas
                try {
                    const newRow = { tanggal: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }), jenis: currentState === 'MENUNGGU_PEMASUKAN' ? 'Pemasukan' : 'Pengeluaran', jumlah: jumlah, keterangan: keterangan };
                    await appendToSheet(newRow);
                    console.log(`--> SUKSES: Data dari ${from} berhasil disimpan.`);
                    // 3. Kirim pesan kedua sebagai konfirmasi sukses
                    const successMessage = `✅ Berhasil dicatat:\n*${newRow.jenis}:* Rp ${jumlah.toLocaleString('id-ID')} - ${keterangan}`;
                    await sendTwilioMessage(from, successMessage);
                } catch (dbError) {
                    console.error(`--> GAGAL: Tidak bisa menyimpan ke Google Sheets untuk ${from}.`, dbError);
                     // Kirim pesan kedua sebagai notifikasi error
                    await sendTwilioMessage(from, `❌ Maaf, terjadi kesalahan saat mencoba menyimpan data Anda.`);
                }
                delete userState[from];
            } else {
                twiml.message('Format salah. Mohon masukkan lagi.\nContoh: `50000 Gaji dari project`');
                res.type('text/xml').send(twiml.toString());
            }
        } else {
            // Untuk menu, 1, 2, dan 3, logikanya dipisah agar lebih rapi
            let replyText = '';
            switch (msgBody.toLowerCase()) {
                case '.menu':
                    replyText = 'Selamat datang di Bot Keuangan!\n\nSilakan pilih menu:\n*1*. Isi Pemasukan 💰\n*2*. Isi Pengeluaran 💸\n*3*. Tampilkan Laporan 📊\n\nKetik nomornya untuk memilih.';
                    twiml.message(replyText);
                    res.type('text/xml').send(twiml.toString());
                    break;
                case '1':
                    userState[from] = 'MENUNGGU_PEMASUKAN';
                    replyText = 'Anda memilih *Isi Pemasukan*.\n\nSilakan kirim dengan format:\n`[jumlah] [keterangan]`\n\nContoh: `500000 Gaji Bulanan`';
                    twiml.message(replyText);
                    res.type('text/xml').send(twiml.toString());
                    break;
                case '2':
                    userState[from] = 'MENUNGGU_PENGELUARAN';
                    replyText = 'Anda memilih *Isi Pengeluaran*.\n\nSilakan kirim dengan format:\n`[jumlah] [keterangan]`\n\nContoh: `25000 Makan Siang`';
                    twiml.message(replyText);
                    res.type('text/xml').send(twiml.toString());
                    break;
                case '3':
                    // Balas dulu, proses, lalu kirim hasil
                    twiml.message('⏳ Sedang mengambil data laporan, mohon tunggu...');
                    res.type('text/xml').send(twiml.toString());
                    
                    const report = await generateReport();
                    await sendTwilioMessage(from, report); 
                    break;
                default:
                    replyText = 'Perintah tidak dikenali. Ketik `.menu` untuk melihat pilihan yang tersedia.';
                    twiml.message(replyText);
                    res.type('text/xml').send(twiml.toString());
                    break;
            }
        }
    } catch (error) {
        console.error('Terjadi error fatal saat memproses pesan:', error);
        // Mencoba mengirim pesan error terakhir jika memungkinkan
        await sendTwilioMessage(from, 'Maaf, terjadi kesalahan besar yang tidak terduga di pihak server. 😔');
        res.status(500).send();
    }
});

app.listen(PORT, () => {
    console.log(`--> Server siap dan berjalan di port ${PORT}`);
});