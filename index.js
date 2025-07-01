// Bab 3: Kode Lengkap untuk index.js

// Import library yang dibutuhkan
const express = require('express');
const bodyParser = require('body-parser');
const { MessagingResponse } = require('twilio').twiml;
const { GoogleSpreadsheet } = require('google-spreadsheet');

// --- KONFIGURASI ---
const PORT = process.env.PORT || 3000;
// Kredensial Google akan dibaca dari file credentials.json
const SPREADSHEET_ID = '1mhNDHi-KPOedP-tt6CaOLKKkDO5bZQ9VfyPDRXfsRxw'; // <-- GANTI INI
const creds = require('./credentials.json');
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
        const jumlah = parseFloat(row.Jumlah) || 0;
        if (row.Jenis === 'Pemasukan') {
            totalPemasukan += jumlah;
        } else if (row.Jenis === 'Pengeluaran') {
            totalPengeluaran += jumlah;
        }
    });

    const sisaUang = totalPemasukan - totalPengeluaran;
    const formatRp = (angka) => `Rp ${angka.toLocaleString('id-ID')}`;

    return `Laporan Keuangan Anda 📊\n\nTotal Pemasukan: ${formatRp(totalPemasukan)}\nTotal Pengeluaran: ${formatRp(totalPengeluaran)}\n\n*Total Uang Sekarang: ${formatRp(sisaUang)}*`;
}


// --- LOGIKA UTAMA BOT ---

// Inisialisasi Aplikasi Express
const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// Endpoint yang akan dihubungi oleh Twilio setiap ada pesan masuk
app.post('/webhook', async (req, res) => {
    const twiml = new MessagingResponse();
    const from = req.body.From; // Nomor pengirim (misal: whatsapp:+62...)
    const msgBody = req.body.Body.trim(); // Isi pesan

    const currentState = userState[from]; // Cek state pengguna
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
                delete userState[from]; // Kembalikan pengguna ke state normal
            } else {
                replyText = 'Format salah. Mohon masukkan lagi.\nContoh: `50000 Gaji dari project`';
            }
        } else {
            // Logika jika pengguna tidak dalam state apa pun (mengetik perintah)
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

    // Mengirim balasan ke pengguna
    twiml.message(replyText);
    res.type('text/xml').send(twiml.toString());
});

// Menjalankan server
app.listen(PORT, () => {
    console.log(`Server berjalan di port ${PORT}`);
});