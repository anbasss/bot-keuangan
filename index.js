// Bab 3: Kode Lengkap untuk index.js (Versi Final untuk Server)

// Import library yang dibutuhkan
const express = require('express');
const bodyParser = require('body-parser');
const { MessagingResponse } = require('twilio').twiml;
const { GoogleSpreadsheet } = require('google-spreadsheet');

// --- KONFIGURASI ---
// Semua kunci rahasia akan dibaca dari Environment Variables di Railway
const PORT = process.env.PORT || 3000;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID; 

// INI BAGIAN PALING PENTING YANG BERBEDA DARI KODE ANDA
let creds;
// Cek apakah variabel GOOGLE_CREDENTIALS ada (di server Railway)
if (process.env.GOOGLE_CREDENTIALS) {
    // Jika ada, baca dari sana
    creds = JSON.parse(process.env.GOOGLE_CREDENTIALS);
} else {
    // Jika tidak ada (saat dijalankan di komputer lokal), baca dari file
    // Pastikan nama file ini sesuai dengan file .json Anda
    creds = require('./gen-lang-client-0501007499-f7d012eb3e61.json'); 
}
const doc = new GoogleSpreadsheet(SPREADSHEET_ID);


// Objek untuk menyimpan state pengguna (biarkan kosong)
let userState = {};

// --- FUNGSI-FUNGSI PEMBANTU ---

// Fungsi untuk menambah data ke Google Sheets
async function appendToSheet(data) {
    await doc.useServiceAccountAuth(creds);
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0]; // Menggunakan sheet pertama
    await sheet.addRow({
        Tanggal: data.tanggal,
        Jenis: data.jenis,
        Jumlah: data.jumlah,
        Keterangan: data.keterangan,
    });
}

// Fungsi untuk membuat laporan keuangan
async function generateReport() {
    await doc.useServiceAccountAuth(creds);
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows();

    let totalPemasukan = 0;
    let totalPengeluaran = 0;

    rows.forEach(row => {
        // Gunakan .get() untuk mengakses data baris dari google-spreadsheet v4
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
app.use(bodyParser.urlencoded({ extended: false }));

app.post('/webhook', async (req, res) => {
    console.log('--- PESAN BARU DITERIMA DI /webhook ---'); // <--- TAMBAHKAN BARIS INI
    console.log('Pengirim:', req.body.From);     
    const twiml = new MessagingResponse();
    const from = req.body.From; 
    const msgBody = req.body.Body.trim(); 
    const currentState = userState[from];
    let replyText = '';

    try {
        if (currentState === 'MENUNGGU_PEMASUKAN' || currentState === 'MENUNGGU_PENGELUARAN') {
            const parts = msgBody.split(' ');
            const jumlah = parseInt(parts[0], 10);
            const keterangan = parts.slice(1).join(' ');

            if (!isNaN(jumlah) && jumlah > 0 && keterangan) {
                const newRow = {
                    tanggal: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }),
                    jenis: currentState === 'MENUNGGU_PEMASUKAN' ? 'Pemasukan' : 'Pengeluaran',
                    jumlah: jumlah,
                    keterangan: keterangan,
                };
                
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
        console.error('Terjadi error:', error);
        replyText = 'Maaf, terjadi kesalahan di pihak server. 😔';
    }

    twiml.message(replyText);
    res.type('text/xml').send(twiml.toString());
});

app.listen(PORT, () => {
    console.log(`Server berjalan di port ${PORT}`);
});