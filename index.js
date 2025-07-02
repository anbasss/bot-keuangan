// =================================================================
// KODE LENGKAP BOT KEUANGAN WHATSAPP
// Versi Final dengan Debugging Startup
// =================================================================

// Import library yang dibutuhkan
const express = require('express');
const bodyParser = require('body-parser');
const { MessagingResponse } = require('twilio').twiml;
const { GoogleSpreadsheet } = require('google-spreadsheet');

// --- KONFIGURASI DENGAN DEBUGGING ---
console.log("Memulai proses startup dan konfigurasi...");

const PORT = process.env.PORT || 3000;

// --- Debugging SPREADSHEET_ID ---
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
if (!SPREADSHEET_ID) {
    console.error("FATAL ERROR: Environment variable SPREADSHEET_ID tidak ditemukan atau kosong!");
    process.exit(1); // Langsung hentikan aplikasi jika ID tidak ada
}
console.log(`--> SPREADSHEET_ID ditemukan: ${SPREADSHEET_ID}`);

// --- Debugging GOOGLE_CREDENTIALS ---
let creds;
const googleCredsRaw = process.env.GOOGLE_CREDENTIALS;
if (googleCredsRaw) {
    console.log("--> GOOGLE_CREDENTIALS ditemukan di environment, mencoba untuk parse...");
    try {
        creds = JSON.parse(googleCredsRaw);
        console.log("--> Parse GOOGLE_CREDENTIALS berhasil!");
    } catch (error) {
        console.error("FATAL ERROR: Gagal melakukan JSON.parse pada GOOGLE_CREDENTIALS!", error.message);
        console.error("Pastikan Anda menyalin SELURUH isi file .json, termasuk kurung kurawal '{' di awal dan '}' di akhir.");
        process.exit(1); // Langsung hentikan aplikasi
    }
} else {
    console.log("--> GOOGLE_CREDENTIALS tidak ditemukan di environment, mencoba membaca file lokal...");
    try {
        // GANTI NAMA FILE DI BAWAH INI DENGAN NAMA FILE .JSON ANDA
        creds = require('./gen-lang-client-0501007499-f7d012eb3e61.json');
        console.log("--> Berhasil membaca file kredensial lokal.");
    } catch (error) {
        console.error("FATAL ERROR: Gagal membaca file kredensial lokal!", error.message);
        process.exit(1);
    }
}

// --- Debugging Inisialisasi GoogleSpreadsheet ---
let doc;
try {
    doc = new GoogleSpreadsheet(SPREADSHEET_ID, {
        /* Opsi otentikasi akan di-set di dalam fungsi */
    });
    console.log("--> Inisialisasi GoogleSpreadsheet berhasil!");
} catch(error) {
    console.error("FATAL ERROR: Gagal membuat instance GoogleSpreadsheet!", error.message);
    process.exit(1); // Langsung hentikan aplikasi
}

console.log("Konfigurasi Selesai. Melanjutkan ke setup aplikasi...");
// --- AKHIR DARI KONFIGURASI DEBUGGING ---

// Objek untuk menyimpan state pengguna (biarkan kosong)
let userState = {};

// --- FUNGSI-FUNGSI PEMBANTU ---
async function authenticateAndLoadSheet() {
    await doc.useServiceAccountAuth(creds);
    await doc.loadInfo();
    return doc.sheetsByIndex[0];
}

async function appendToSheet(data) {
    const sheet = await authenticateAndLoadSheet();
    await sheet.addRow({
        Tanggal: data.tanggal,
        Jenis: data.jenis,
        Jumlah: data.jumlah,
        Keterangan: data.keterangan,
    });
}

async function generateReport() {
    const sheet = await authenticateAndLoadSheet();
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
app.use(bodyParser.urlencoded({ extended: false }));

app.post('/webhook', async (req, res) => {
    console.log('--- PESAN BARU DITERIMA DI /webhook ---');
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
        console.error('Terjadi error saat memproses pesan:', error);
        replyText = 'Maaf, terjadi kesalahan di pihak server. 😔';
    }

    twiml.message(replyText);
    res.type('text/xml').send(twiml.toString());
});

app.listen(PORT, () => {
    console.log(`--> Server siap dan berjalan di port ${PORT}`);
});