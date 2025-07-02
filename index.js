// =================================================================
// KODE LENGKAP BOT KEUANGAN WHATSAPP
// Versi Final - Dengan Perbaikan Otentikasi Google Sheets v4 (JWT Auth)
// =================================================================

const express = require('express');
const bodyParser = require('body-parser');
const { MessagingResponse } = require('twilio').twiml;
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library'); // <-- LIBRARY BARU UNTUK OTENTIKASI

// --- KONFIGURASI ---
console.log("Memulai proses startup dan konfigurasi...");
const PORT = process.env.PORT || 3000;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
let creds;

if (process.env.GOOGLE_CREDENTIALS) {
    creds = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    console.log("--> Kredensial Google berhasil di-parse dari environment.");
} else {
    // Sesuaikan nama file ini jika Anda testing di komputer lokal
    creds = require('./nama-file-kredensial-anda.json'); 
}

// --- PERBAIKAN FINAL GOOGLE SHEETS v4 ---
// Menggunakan metode otentikasi JWT yang direkomendasikan
const serviceAccountAuth = new JWT({
    email: creds.client_email,
    key: creds.private_key.replace(/\\n/g, '\n'),
    scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive.file',
    ],
});

const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);
console.log("Konfigurasi Selesai. Melanjutkan ke setup aplikasi...");
// --- AKHIR DARI PERBAIKAN FINAL ---

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
        if (row.get('Jenis') === 'Pemasukan') { totalPemasukan += jumlah; } 
        else if (row.get('Jenis') === 'Pengeluaran') { totalPengeluaran += jumlah; }
    });
    const sisaUang = totalPemasukan - totalPengeluaran;
    const formatRp = (angka) => `Rp ${angka.toLocaleString('id-ID')}`;
    return `Laporan Keuangan Anda 📊\n\nTotal Pemasukan: ${formatRp(totalPemasukan)}\nTotal Pengeluaran: ${formatRp(totalPengeluaran)}\n\n*Total Uang Sekarang: ${formatRp(sisaUang)}*`;
}

// --- LOGIKA UTAMA BOT (Versi Twilio) ---
const app = express();
app.use(bodyParser.urlencoded({ extended: true }));

// GANTI SELURUH BLOK INI DI KODE ANDA
app.post('/webhook', async (req, res) => {
    console.log('--- PESAN BARU DITERIMA DI /webhook ---');
    const from = req.body.From; 
    const msgBody = req.body.Body ? req.body.Body.trim() : '';
    console.log('Pengirim:', from, '| Isi Pesan:', msgBody);

    const twiml = new MessagingResponse();
    const currentState = userState[from];
    let replyText = '';

    // Logika untuk .menu, 1, 2, 3 (yang tidak butuh proses lama)
    if (currentState !== 'MENUNGGU_PEMASUKAN' && currentState !== 'MENUNGGU_PENGELUARAN') {
        try {
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
                    // Generate report bisa jadi lama, kita terapkan pola yang sama
                    twiml.message('⏳ Sedang mengambil data laporan, mohon tunggu...');
                    res.type('text/xml').send(twiml.toString());

                    // Proses di latar belakang
                    const report = await generateReport();
                    // Kirim laporan sebagai pesan baru via Twilio API (ini lebih kompleks, untuk sekarang kita log saja)
                    console.log("--> Laporan selesai dibuat. Jika ingin mengirim, butuh Twilio API call.");
                    // Untuk saat ini, kita tidak mengirim balasan kedua untuk menjaga kesederhanaan.
                    return; // Hentikan eksekusi di sini
                default:
                    replyText = 'Perintah tidak dikenali. Ketik `.menu` untuk melihat pilihan yang tersedia.';
                    break;
            }
            twiml.message(replyText);
            res.type('text/xml').send(twiml.toString());
        } catch (error) {
            console.error('Terjadi error saat memproses menu:', error);
            twiml.message('Maaf, terjadi kesalahan di pihak server. 😔');
            res.type('text/xml').send(twiml.toString());
        }
    } 
    // Logika khusus untuk mencatat data (yang butuh proses lama)
    else {
        const parts = msgBody.split(' ');
        const jumlah = parseInt(parts[0], 10);
        const keterangan = parts.slice(1).join(' ');

        if (!isNaN(jumlah) && jumlah > 0 && keterangan) {
            // 1. Kirim balasan instan "Sedang diproses"
            const processingMessage = `⏳ Siap! Data _'${jumlah} ${keterangan}'_ sedang diproses...`;
            twiml.message(processingMessage);
            res.type('text/xml').send(twiml.toString());

            // 2. Lakukan tugas berat di latar belakang SETELAH membalas
            try {
                const newRow = { 
                    tanggal: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }), 
                    jenis: currentState === 'MENUNGGU_PEMASUKAN' ? 'Pemasukan' : 'Pengeluaran', 
                    jumlah: jumlah, 
                    keterangan: keterangan 
                };
                await appendToSheet(newRow);
                console.log(`--> SUKSES: Data dari ${from} berhasil disimpan ke Google Sheets.`);
            } catch (dbError) {
                console.error(`--> GAGAL: Tidak bisa menyimpan ke Google Sheets untuk ${from}.`, dbError);
                // Kita tidak bisa mengirim pesan balasan error lagi karena koneksi sudah ditutup.
                // Cukup catat di log untuk debugging oleh Anda.
            }
            delete userState[from]; // Hapus state setelah selesai

        } else {
            // Jika formatnya salah, balas seperti biasa
            replyText = 'Format salah. Mohon masukkan lagi.\nContoh: `50000 Gaji dari project`';
            twiml.message(replyText);
            res.type('text/xml').send(twiml.toString());
        }
    }
});

app.listen(PORT, () => {
    console.log(`--> Server siap dan berjalan di port ${PORT}`);
});