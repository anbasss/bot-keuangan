// =================================================================
// KODE LENGKAP BOT KEUANGAN WHATSAPP
// Versi Final dengan Perbaikan Google Sheets v4
// =================================================================

// Import library yang dibutuhkan
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const qs = require('qs');

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

// --- PERBAIKAN GOOGLE SHEETS v4 ---
// Kredensial langsung dimasukkan saat inisialisasi
const doc = new GoogleSpreadsheet(SPREADSHEET_ID, {
    email: creds.client_email,
    private_key: creds.private_key.replace(/\\n/g, '\n'),
});
console.log("Konfigurasi Selesai. Melanjutkan ke setup aplikasi...");
// --- AKHIR DARI PERBAIKAN ---


let userState = {};

// --- FUNGSI-FUNGSI PEMBANTU (DISESUAIKAN UNTUK v4) ---
// Fungsi ini menjadi lebih sederhana
async function loadSheet() {
    await doc.loadInfo(); // Memuat properti dokumen
    return doc.sheetsByIndex[0]; // Mengambil sheet pertama
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

// --- LOGIKA UTAMA BOT (Kita gunakan MessageBird sesuai pilihan terakhir) ---
const app = express();
app.use(bodyParser.json());

app.post('/webhook', async (req, res) => {
    if (!req.body.message || req.body.type !== 'message.created') {
        return res.status(200).send('OK');
    }
    
    console.log('--- PESAN BARU DITERIMA ---');
    const from = req.body.message.from;
    const msgBody = req.body.message.content.text.trim();
    console.log('Pengirim:', from);
    console.log('Isi Pesan:', msgBody);

    const currentState = userState[from];
    let replyText = '';

    try {
        if (currentState === 'MENUNGGU_PEMASUKAN' || currentState === 'MENUNGGU_PENGELUARAN') {
            const parts = msgBody.split(' ');
            const jumlah = parseInt(parts[0], 10);
            const keterangan = parts.slice(1).join(' ');
            if (!isNaN(jumlah) && jumlah > 0 && keterangan) {
                const newRow = { tanggal: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }), jenis: currentState === 'MENUNGGU_PEMASUKAN' ? 'Pemasukan' : 'Pengeluaran', jumlah: jumlah, keterangan: keterangan };
                await appendToSheet(newRow); // Memanggil fungsi yang sudah diperbaiki
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
                    replyText = await generateReport(); // Memanggil fungsi yang sudah diperbaiki
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
    
    // Mengirim balasan (disesuaikan untuk MessageBird)
    if (replyText && process.env.MESSAGEBIRD_API_KEY) {
        try {
            await axios.post('https://conversations.messagebird.com/v1/conversations/start', { to: from, type: 'text', channelId: process.env.MESSAGEBIRD_CHANNEL_ID, content: { text: replyText } }, { headers: { 'Authorization': `AccessKey ${process.env.MESSAGEBIRD_API_KEY}` } });
            console.log('--> Balasan berhasil dikirim.');
        } catch (error) {
            console.error('Error saat mengirim balasan:', error.response ? error.response.data.errors : error.message);
        }
    }
    
    res.status(200).send('OK');
});

app.listen(PORT, () => {
    console.log(`--> Server siap dan berjalan di port ${PORT}`);
});