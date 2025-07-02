// =================================================================
// KODE LENGKAP BOT KEUANGAN WHATSAPP
// Platform: Twilio & Railway | Database: Google Sheets
// Versi Final - Sudah Termasuk Debugging & Perbaikan
// =================================================================

// Import library yang dibutuhkan
const express = require('express');
const bodyParser = require('body-parser');
const { MessagingResponse } = require('twilio').twiml; // Kembali menggunakan TwiML untuk Twilio
const { GoogleSpreadsheet } = require('google-spreadsheet');

// --- KONFIGURASI ---
console.log("Memulai proses startup dan konfigurasi...");
const PORT = process.env.PORT || 3000;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
let creds;

// Membaca kredensial dari Environment Variables (untuk Railway)
if (process.env.GOOGLE_CREDENTIALS) {
    creds = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    console.log("--> Kredensial Google berhasil di-parse dari environment.");
} else {
    // Fallback untuk testing di komputer lokal
    console.log("--> Membaca kredensial dari file lokal...");
    // !!! PENTING: Ganti nama file di bawah ini dengan nama file .json Anda !!!
    creds = require('./nama-file-kredensial-anda.json'); 
}

// Inisialisasi Google Sheets dengan metode otentikasi v4
const doc = new GoogleSpreadsheet(SPREADSHEET_ID, {
    email: creds.client_email,
    private_key: creds.private_key.replace(/\\n/g, '\n'),
});
console.log("Konfigurasi Selesai. Melanjutkan ke setup aplikasi...");


// Objek untuk menyimpan state pengguna
let userState = {};

// --- FUNGSI-FUNGSI PEMBANTU ---
async function loadSheet() {
    await doc.loadInfo();
    return doc.sheetsByIndex[0];
}

async function appendToSheet(data) {
    const sheet = await loadSheet();
    await sheet.addRow({
        Tanggal: data.tanggal,
        Jenis: data.jenis,
        Jumlah: data.jumlah,
        Keterangan: data.keterangan,
    });
}

async function generateReport() {
    const sheet = await loadSheet();
    const rows = await sheet.getRows();
    let totalPemasukan = 0;
    let totalPengeluaran = 0;
    rows.forEach(row => {
        const jumlah = parseFloat(row.get('Jumlah')) || 0;
        if (row.get('Jenis') === 'Pemasukan') {
            totalPemasukan += jumlah;
        } else if (row.get('Jenis') === 'Pengeluaran') {
            totalPengeluaran += jumlah;
        }
    });
    const sisaUang = totalPemasukan - totalPengeluaran;
    const formatRp = (angka) => `Rp ${angka.toLocaleString('id-ID')}`;
    return `Laporan Keuangan Anda 📊\n\nTotal Pemasukan: ${formatRp(totalPemasukan)}\nTotal Pengeluaran: ${formatRp(totalPengeluaran)}\n\n*Total Uang Sekarang: ${formatRp(sisaUang)}*`;
}

// --- LOGIKA UTAMA BOT ---
const app = express();
// Menggunakan parser untuk format Twilio
app.use(bodyParser.urlencoded({ extended: true }));

app.post('/webhook', async (req, res) => {
    console.log('--- PESAN BARU DITERIMA DI /webhook ---');
    
    // Mengambil data dari format Twilio
    const from = req.body.From; 
    const msgBody = req.body.Body ? req.body.Body.trim() : '';

    console.log('Pengirim:', from);
    console.log('Isi Pesan:', msgBody);

    const twiml = new MessagingResponse();
    const currentState = userState[from];
    let replyText = '';

    try {
        if (currentState === 'MENUNGGU_PEMASUKAN' || currentState === 'MENUNGGU_PENGELUARAN') {
            const parts = msgBody.split(' ');
            const jumlah = parseInt(parts[0], 10);
            const keterangan = parts.slice(1).join(' ');
            if (!isNaN(jumlah) && jumlah > 0 && keterangan) {
                const newRow = { tanggal: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }), jenis: currentState === 'MENUNGGU_PEMASUKAN' ? 'Pemasukan' : 'Pengeluaran', jumlah: jumlah, keterangan: keterangan };
                await appendToSheet(newRow);
                replyText = `✅ Berhasil dicatat:\n*${newRow.jenis}:* Rp ${jumlah.toLocaleString('id-ID')} - ${keterangan}`;
                delete userState[from];
            } else {
                replyText = 'Format salah. Mohon masukkan lagi.\nContoh: `50000 Gaji dari project`';
            }
        } else {
            switch (msgBody.toLowerCase()) {
                case '.menu':
                    replyText = 'Selamat datang di Bot Keuangan!\n\nSilakan pilih menu:\n*1*. Isi Pemasukan 💰\n*2*. Isi Pengeluaran 💸\n*3*. Tampilkan Laporan 📊\n\nKetik nomornya untuk memilih.';
                    break;
                case '1':
                    userState[from] = 'MENUNGGU_PEMASUKAN';
                    replyText = 'Anda memilih *Isi Pemasukan*.\n\nSilakan kirim dengan format:\n`[jumlah] [keterangan]`\n\nContoh: `500000 Gaji Bulanan`';
                    break;
                case '2':
                    userState[from] = 'MENUNGGU_PENGELUARAN';
                    replyText = 'Anda memilih *Isi Pengeluaran*.\n\nSilakan kirim dengan format:\n`[jumlah] [keterangan]`\n\nContoh: `25000 Makan Siang`';
                    break;
                case '3':
                    replyText = await generateReport();
                    break;
                default:
                    replyText = 'Perintah tidak dikenali. Ketik `.menu` untuk melihat pilihan yang tersedia.';
                    break;
            }
        }
    } catch (error) {
        console.error('Terjadi error saat memproses pesan:', error);
        replyText = 'Maaf, terjadi kesalahan di pihak server. 😔';
    }
    
    // Mengirim balasan dalam format TwiML untuk Twilio
    twiml.message(replyText);
    res.type('text/xml').send(twiml.toString());
});

app.listen(PORT, () => {
    console.log(`--> Server siap dan berjalan di port ${PORT}`);
});