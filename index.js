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
async function loadSheet() { 
    await doc.loadInfo(); 
    return doc.sheetsByIndex[0]; 
}

async function appendToSheet(data) { 
    const sheet = await loadSheet(); 
    await sheet.addRow({ 
        Tanggal: data.tanggal, 
        Jenis: data.jenis, 
        Kategori: data.kategori || 'Lainnya',
        Jumlah: data.jumlah, 
        Keterangan: data.keterangan 
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
    
    return `Laporan Keuangan Anda 📊\n\n` +
           `Total Pemasukan: ${formatRp(totalPemasukan)}\n` +
           `Total Pengeluaran: ${formatRp(totalPengeluaran)}\n\n` +
           `*Total Uang Sekarang: ${formatRp(sisaUang)}*`; 
}

async function sendTwilioMessage(to, messageBody) { 
    try { 
        const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`; 
        const data = { 
            To: to, 
            From: TWILIO_PHONE_NUMBER, 
            Body: messageBody 
        }; 
        
        await axios.post(endpoint, qs.stringify(data), { 
            auth: { 
                username: TWILIO_ACCOUNT_SID, 
                password: TWILIO_AUTH_TOKEN 
            } 
        }); 
        
        console.log(`--> Pesan proaktif berhasil dikirim ke ${to}`); 
    } catch (error) { 
        console.error("Error saat mengirim pesan via Twilio API:", error.response ? error.response.data : "Unknown Error"); 
    } 
}

// --- FITUR LENGKAP BOT KEUANGAN ---

// Kategori default
const KATEGORI_PEMASUKAN = ['Gaji', 'Freelance', 'Investasi', 'Hadiah', 'Bonus', 'Lainnya'];
const KATEGORI_PENGELUARAN = ['Makanan', 'Transport', 'Belanja', 'Tagihan', 'Hiburan', 'Kesehatan', 'Pendidikan', 'Lainnya'];

async function getRecentTransactions(limit = 10) {
    const sheet = await loadSheet();
    const rows = await sheet.getRows({ limit });
    if (rows.length === 0) {
        return 'Belum ada transaksi untuk ditampilkan.';
    }
    let response = `Berikut ${Math.min(limit, rows.length)} transaksi terakhir Anda:\n\n`;
    rows.forEach((row, index) => {
        const tanggal = row.get('Tanggal');
        const jenis = row.get('Jenis');
        const kategori = row.get('Kategori') || 'Tidak ada';
        const jumlah = parseFloat(row.get('Jumlah')).toLocaleString('id-ID');
        const keterangan = row.get('Keterangan');
        
        response += `*${index + 1}*. 📅 ${tanggal}\n`;
        response += `   [${jenis}] ${kategori} - Rp ${jumlah}\n`;
        response += `   📝 ${keterangan}\n\n`;
    });
    response += 'Ketik `.hapus [nomor]` untuk menghapus atau `.edit [nomor]` untuk edit.';
    return response;
}

async function searchTransactions(keyword) {
    const sheet = await loadSheet();
    const rows = await sheet.getRows();
    const filteredRows = rows.filter(row => {
        const keterangan = (row.get('Keterangan') || '').toLowerCase();
        const kategori = (row.get('Kategori') || '').toLowerCase();
        return keterangan.includes(keyword.toLowerCase()) || kategori.includes(keyword.toLowerCase());
    });

    if (filteredRows.length === 0) {
        return `Tidak ditemukan transaksi dengan kata kunci "${keyword}".`;
    }

    let response = `🔍 Hasil pencarian "${keyword}" (${filteredRows.length} transaksi):\n\n`;
    filteredRows.slice(0, 10).forEach((row, index) => {
        const tanggal = row.get('Tanggal');
        const jenis = row.get('Jenis');
        const kategori = row.get('Kategori') || 'Tidak ada';
        const jumlah = parseFloat(row.get('Jumlah')).toLocaleString('id-ID');
        const keterangan = row.get('Keterangan');
        
        response += `*${index + 1}*. 📅 ${tanggal}\n`;
        response += `   [${jenis}] ${kategori} - Rp ${jumlah}\n`;
        response += `   📝 ${keterangan}\n\n`;
    });

    if (filteredRows.length > 10) {
        response += `... dan ${filteredRows.length - 10} transaksi lainnya.`;
    }

    return response;
}

async function getTransactionsByCategory(kategori) {
    const sheet = await loadSheet();
    const rows = await sheet.getRows();
    const filteredRows = rows.filter(row => {
        const rowKategori = (row.get('Kategori') || '').toLowerCase();
        return rowKategori === kategori.toLowerCase();
    });

    if (filteredRows.length === 0) {
        return `Tidak ditemukan transaksi dalam kategori "${kategori}".`;
    }

    let totalJumlah = 0;
    let response = `📊 Transaksi kategori "${kategori}" (${filteredRows.length} transaksi):\n\n`;
    
    filteredRows.slice(0, 10).forEach((row, index) => {
        const tanggal = row.get('Tanggal');
        const jenis = row.get('Jenis');
        const jumlah = parseFloat(row.get('Jumlah'));
        const keterangan = row.get('Keterangan');
        totalJumlah += jumlah;
        
        response += `*${index + 1}*. 📅 ${tanggal}\n`;
        response += `   [${jenis}] Rp ${jumlah.toLocaleString('id-ID')}\n`;
        response += `   📝 ${keterangan}\n\n`;
    });

    response += `💰 Total dalam kategori ini: Rp ${totalJumlah.toLocaleString('id-ID')}`;
    
    if (filteredRows.length > 10) {
        response += `\n\n... dan ${filteredRows.length - 10} transaksi lainnya.`;
    }

    return response;
}

async function getReportByPeriod(period) {
    const sheet = await loadSheet();
    const rows = await sheet.getRows();
    const today = new Date();
    let startDate, endDate;

    switch (period) {
        case 'hari':
            startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
            break;
        case 'minggu':
            const startOfWeek = today.getDate() - today.getDay();
            startDate = new Date(today.getFullYear(), today.getMonth(), startOfWeek);
            endDate = new Date(today.getFullYear(), today.getMonth(), startOfWeek + 7);
            break;
        case 'bulan':
            startDate = new Date(today.getFullYear(), today.getMonth(), 1);
            endDate = new Date(today.getFullYear(), today.getMonth() + 1, 1);
            break;
        default:
            return 'Period tidak valid. Gunakan: hari, minggu, atau bulan.';
    }

    const filteredRows = rows.filter(row => {
        const tanggalStr = row.get('Tanggal');
        const [day, month, year] = tanggalStr.split('/');
        const rowDate = new Date(year, month - 1, day);
        return rowDate >= startDate && rowDate < endDate;
    });

    if (filteredRows.length === 0) {
        return `Tidak ada transaksi dalam periode ${period} ini.`;
    }

    let totalPemasukan = 0;
    let totalPengeluaran = 0;
    let kategoriStats = {};

    filteredRows.forEach(row => {
        const jenis = row.get('Jenis');
        const kategori = row.get('Kategori') || 'Tidak ada';
        const jumlah = parseFloat(row.get('Jumlah')) || 0;

        if (jenis === 'Pemasukan') {
            totalPemasukan += jumlah;
        } else {
            totalPengeluaran += jumlah;
        }

        if (!kategoriStats[kategori]) {
            kategoriStats[kategori] = 0;
        }
        kategoriStats[kategori] += jumlah;
    });

    const formatRp = (angka) => `Rp ${angka.toLocaleString('id-ID')}`;
    const sisaUang = totalPemasukan - totalPengeluaran;

    let response = `📊 Laporan ${period.toUpperCase()}\n`;
    response += `📅 ${startDate.toLocaleDateString('id-ID')} - ${new Date(endDate.getTime() - 1).toLocaleDateString('id-ID')}\n\n`;
    response += `💰 Total Pemasukan: ${formatRp(totalPemasukan)}\n`;
    response += `💸 Total Pengeluaran: ${formatRp(totalPengeluaran)}\n`;
    response += `💵 Sisa: ${formatRp(sisaUang)}\n\n`;
    response += `📈 ${filteredRows.length} transaksi tercatat\n\n`;
    
    response += `📊 Per Kategori:\n`;
    Object.entries(kategoriStats)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .forEach(([kategori, total]) => {
            response += `• ${kategori}: ${formatRp(total)}\n`;
        });

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
        const jenis = rowToDelete.get('Jenis');
        const jumlah = parseFloat(rowToDelete.get('Jumlah')).toLocaleString('id-ID');
        await rowToDelete.delete();
        return `✅ Transaksi berhasil dihapus!\n\n[${jenis}] Rp ${jumlah}\n📝 ${keterangan}`;
    } else {
        return `❌ Transaksi nomor ${rowIndex} tidak ditemukan.`;
    }
}

async function getTransactionForEdit(rowIndex) {
    if (isNaN(rowIndex) || rowIndex < 1) {
        return 'Nomor tidak valid. Harap masukkan nomor urut yang benar.';
    }
    const sheet = await loadSheet();
    const rows = await sheet.getRows();
    const actualIndex = rowIndex - 1;
    if (actualIndex >= 0 && actualIndex < rows.length) {
        const row = rows[actualIndex];
        const transaksi = {
            index: actualIndex,
            tanggal: row.get('Tanggal'),
            jenis: row.get('Jenis'),
            kategori: row.get('Kategori') || 'Tidak ada',
            jumlah: row.get('Jumlah'),
            keterangan: row.get('Keterangan')
        };
        return transaksi;
    }
    return null;
}

async function updateTransaction(rowIndex, newData) {
    const sheet = await loadSheet();
    const rows = await sheet.getRows();
    const actualIndex = rowIndex - 1;
    if (actualIndex >= 0 && actualIndex < rows.length) {
        const row = rows[actualIndex];
        
        if (newData.tanggal) row.set('Tanggal', newData.tanggal);
        if (newData.jenis) row.set('Jenis', newData.jenis);
        if (newData.kategori) row.set('Kategori', newData.kategori);
        if (newData.jumlah) row.set('Jumlah', newData.jumlah);
        if (newData.keterangan) row.set('Keterangan', newData.keterangan);
        
        await row.save();
        
        const formatRp = (angka) => `Rp ${parseFloat(angka).toLocaleString('id-ID')}`;
        return `✅ Transaksi berhasil diupdate!\n\n` +
               `📅 Tanggal: ${row.get('Tanggal')}\n` +
               `📊 Jenis: ${row.get('Jenis')}\n` +
               `🏷️ Kategori: ${row.get('Kategori')}\n` +
               `💰 Jumlah: ${formatRp(row.get('Jumlah'))}\n` +
               `📝 Keterangan: ${row.get('Keterangan')}`;
    }
    return `❌ Transaksi nomor ${rowIndex + 1} tidak ditemukan.`;
}

function getHelpMessage() {
    return `🤖 *PANDUAN BOT KEUANGAN* 🤖\n\n` +
           `📋 *MENU UTAMA:*\n` +
           `• Ketik \`.menu\` - Tampilkan menu utama\n` +
           `• Ketik \`1\` - Catat pemasukan\n` +
           `• Ketik \`2\` - Catat pengeluaran\n` +
           `• Ketik \`3\` - Lihat laporan lengkap\n` +
           `• Ketik \`4\` - Lihat 10 transaksi terakhir\n\n` +
           
           `🔍 *PENCARIAN & FILTER:*\n` +
           `• \`.cari [kata kunci]\` - Cari transaksi\n` +
           `• \`.kategori [nama]\` - Filter by kategori\n` +
           `• \`.hari\` - Laporan hari ini\n` +
           `• \`.minggu\` - Laporan minggu ini\n` +
           `• \`.bulan\` - Laporan bulan ini\n\n` +
           
           `✏️ *EDIT & HAPUS:*\n` +
           `• \`.hapus [nomor]\` - Hapus transaksi\n` +
           `• \`.edit [nomor]\` - Edit transaksi\n\n` +
           
           `📊 *STATISTIK & EXPORT:*\n` +
           `• \`.stats\` - Statistik cepat\n` +
           `• \`.export\` - Export semua data\n\n` +
           
           `📊 *KATEGORI PEMASUKAN:*\n` +
           `Gaji, Freelance, Investasi, Hadiah, Bonus, Lainnya\n\n` +
           
           `💸 *KATEGORI PENGELUARAN:*\n` +
           `Makanan, Transport, Belanja, Tagihan, Hiburan, Kesehatan, Pendidikan, Lainnya\n\n` +
           
           `💡 *TIPS:*\n` +
           `• Format input: [jumlah] [kategori] [keterangan]\n` +
           `• Contoh: \`500000 Gaji Gaji bulan Januari\`\n` +
           `• Gunakan \`.bantuan\` untuk melihat panduan ini`;
}

function getMainMenu() {
    return `🏦 *BOT KEUANGAN LENGKAP* 🏦\n\n` +
           `Silakan pilih menu:\n` +
           `*1*. 💰 Catat Pemasukan\n` +
           `*2*. 💸 Catat Pengeluaran\n` +
           `*3*. 📊 Laporan Lengkap\n` +
           `*4*. 📋 10 Transaksi Terakhir\n\n` +
           
           `🔍 *FITUR LANJUTAN:*\n` +
           `• \`.cari [kata]\` - Cari transaksi\n` +
           `• \`.kategori [nama]\` - Filter kategori\n` +
           `• \`.hari/.minggu/.bulan\` - Laporan periode\n` +
           `• \`.bantuan\` - Panduan lengkap\n\n` +
           
           `Ketik \`.hapus [nomor]\` atau \`.edit [nomor]\` untuk mengatur transaksi.`;
}

// --- INISIALISASI GOOGLE SHEETS ---
async function initializeSheet() {
    try {
        const sheet = await loadSheet();
        const headers = await sheet.getHeaderValues();
        
        // Jika tidak ada header atau header tidak lengkap, set header
        if (headers.length === 0 || !headers.includes('Kategori')) {
            await sheet.setHeaderRow(['Tanggal', 'Jenis', 'Kategori', 'Jumlah', 'Keterangan']);
            console.log('✅ Header Google Sheets telah diinisialisasi');
        }
    } catch (error) {
        console.error('Error saat inisialisasi sheet:', error);
    }
}

// --- STATISTIK CEPAT ---
async function getQuickStats() {
    const sheet = await loadSheet();
    const rows = await sheet.getRows();
    
    if (rows.length === 0) {
        return '📊 Belum ada data untuk ditampilkan.\n\nKetik `1` untuk mulai mencatat pemasukan atau `2` untuk pengeluaran.';
    }

    let totalPemasukan = 0;
    let totalPengeluaran = 0;
    let transaksiHariIni = 0;
    const today = new Date().toLocaleDateString('id-ID');
    
    rows.forEach(row => {
        const jenis = row.get('Jenis');
        const jumlah = parseFloat(row.get('Jumlah')) || 0;
        const tanggal = row.get('Tanggal');
        
        if (jenis === 'Pemasukan') {
            totalPemasukan += jumlah;
        } else {
            totalPengeluaran += jumlah;
        }
        
        if (tanggal === today) {
            transaksiHariIni++;
        }
    });

    const saldo = totalPemasukan - totalPengeluaran;
    const formatRp = (angka) => `Rp ${angka.toLocaleString('id-ID')}`;
    
    return `📊 *STATISTIK CEPAT*\n\n` +
           `💰 Total Pemasukan: ${formatRp(totalPemasukan)}\n` +
           `💸 Total Pengeluaran: ${formatRp(totalPengeluaran)}\n` +
           `💵 Saldo Saat Ini: ${formatRp(saldo)}\n\n` +
           `📈 Total Transaksi: ${rows.length}\n` +
           `📅 Transaksi Hari Ini: ${transaksiHariIni}\n\n` +
           `Ketik \`.menu\` untuk opsi lengkap.`;
}

function getWelcomeMessage() {
    return `🏦 *SELAMAT DATANG!* 🏦\n\n` +
           `Bot Keuangan Lengkap v2.0 siap membantu Anda mengelola keuangan! 💰\n\n` +
           `🚀 *MULAI CEPAT:*\n` +
           `• Ketik \`1\` - Catat pemasukan\n` +
           `• Ketik \`2\` - Catat pengeluaran\n` +
           `• Ketik \`.stats\` - Lihat statistik cepat\n` +
           `• Ketik \`.menu\` - Menu lengkap\n` +
           `• Ketik \`.bantuan\` - Panduan detail\n\n` +
           `Mari mulai mencatat keuangan Anda! ✨`;
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
        const replyText = getMainMenu();
        twiml.message(replyText);
        return res.type('text/xml').send(twiml.toString());
    }

    // Perintah bantuan
    if (lowerCaseMsg === '.bantuan' || lowerCaseMsg === '.help') {
        delete userState[from];
        const replyText = getHelpMessage();
        twiml.message(replyText);
        return res.type('text/xml').send(twiml.toString());
    }

    // Perintah selamat datang
    if (lowerCaseMsg === '.mulai' || lowerCaseMsg === '.start' || lowerCaseMsg === 'hi' || lowerCaseMsg === 'halo') {
        delete userState[from];
        const replyText = getWelcomeMessage();
        twiml.message(replyText);
        return res.type('text/xml').send(twiml.toString());
    }

    try {
        if (currentState === 'MENUNGGU_PEMASUKAN' || currentState === 'MENUNGGU_PENGELUARAN') {
            // Parsing input user untuk mencatat transaksi
            const parts = msgBody.split(' ');
            if (parts.length < 3) {
                const jenisTransaksi = currentState === 'MENUNGGU_PEMASUKAN' ? 'pemasukan' : 'pengeluaran';
                const kategoriList = currentState === 'MENUNGGU_PEMASUKAN' ? KATEGORI_PEMASUKAN : KATEGORI_PENGELUARAN;
                twiml.message(`Format salah! Gunakan format: [jumlah] [kategori] [keterangan]\n\n` +
                            `Kategori ${jenisTransaksi}: ${kategoriList.join(', ')}\n\n` +
                            `Contoh: 500000 Gaji Gaji bulan Januari`);
                res.type('text/xml').send(twiml.toString());
                return;
            }

            const jumlah = parseFloat(parts[0]);
            const kategori = parts[1];
            const keterangan = parts.slice(2).join(' ');

            if (isNaN(jumlah) || jumlah <= 0) {
                twiml.message('Jumlah harus berupa angka positif!\n\nContoh: 500000 Gaji Gaji bulan Januari');
                res.type('text/xml').send(twiml.toString());
                return;
            }

            // Validasi kategori
            const validKategori = currentState === 'MENUNGGU_PEMASUKAN' ? KATEGORI_PEMASUKAN : KATEGORI_PENGELUARAN;
            if (!validKategori.some(k => k.toLowerCase() === kategori.toLowerCase())) {
                const jenisTransaksi = currentState === 'MENUNGGU_PEMASUKAN' ? 'pemasukan' : 'pengeluaran';
                twiml.message(`Kategori "${kategori}" tidak valid untuk ${jenisTransaksi}.\n\n` +
                            `Kategori yang tersedia: ${validKategori.join(', ')}`);
                res.type('text/xml').send(twiml.toString());
                return;
            }

            // Kirim respon awal
            twiml.message('⏳ Sedang menyimpan data...');
            res.type('text/xml').send(twiml.toString());

            try {
                // Tentukan jenis transaksi
                const jenis = currentState === 'MENUNGGU_PEMASUKAN' ? 'Pemasukan' : 'Pengeluaran';
                
                // Siapkan data untuk disimpan
                const today = new Date();
                const tanggal = today.toLocaleDateString('id-ID');
                
                const dataToSave = {
                    tanggal: tanggal,
                    jenis: jenis,
                    kategori: kategori,
                    jumlah: jumlah,
                    keterangan: keterangan
                };

                // Simpan ke Google Sheets
                await appendToSheet(dataToSave);

                // Format konfirmasi
                const formatRp = (angka) => `Rp ${angka.toLocaleString('id-ID')}`;
                const konfirmasi = `✅ ${jenis} berhasil dicatat!\n\n` +
                    `💰 Jumlah: ${formatRp(jumlah)}\n` +
                    `🏷️ Kategori: ${kategori}\n` +
                    `📝 Keterangan: ${keterangan}\n` +
                    `📅 Tanggal: ${tanggal}\n\n` +
                    `Ketik .menu untuk kembali ke menu utama.`;

                // Kirim konfirmasi
                await sendTwilioMessage(from, konfirmasi);

                // Reset state user
                delete userState[from];

            } catch (saveError) {
                console.error('Error saat menyimpan data:', saveError);
                await sendTwilioMessage(from, 'Maaf, terjadi kesalahan saat menyimpan data. Silakan coba lagi.');
                delete userState[from];
            }
            return;
        } else if (currentState && currentState.startsWith('EDIT_')) {
            // Handle edit transaction
            const editIndex = parseInt(currentState.split('_')[1]);
            const parts = msgBody.split(' ');
            
            if (parts.length < 3) {
                twiml.message('Format edit salah! Gunakan: [jumlah] [kategori] [keterangan]');
                res.type('text/xml').send(twiml.toString());
                return;
            }

            const jumlah = parseFloat(parts[0]);
            const kategori = parts[1];
            const keterangan = parts.slice(2).join(' ');

            if (isNaN(jumlah) || jumlah <= 0) {
                twiml.message('Jumlah harus berupa angka positif!');
                res.type('text/xml').send(twiml.toString());
                return;
            }

            twiml.message('⏳ Sedang mengupdate data...');
            res.type('text/xml').send(twiml.toString());

            try {
                const today = new Date();
                const tanggal = today.toLocaleDateString('id-ID');
                
                const newData = {
                    tanggal: tanggal,
                    kategori: kategori,
                    jumlah: jumlah,
                    keterangan: keterangan
                };

                const result = await updateTransaction(editIndex, newData);
                await sendTwilioMessage(from, result);
                delete userState[from];
            } catch (error) {
                console.error('Error saat update:', error);
                await sendTwilioMessage(from, 'Maaf, terjadi kesalahan saat mengupdate data.');
                delete userState[from];
            }
            return;
        } else {
            // Logika untuk menu utama
            let replyText = '';
            
            // Perintah yang diproses di latar belakang
            if (lowerCaseMsg === '3' || lowerCaseMsg === '.terakhir' || lowerCaseMsg.startsWith('.hapus') || 
                lowerCaseMsg.startsWith('.cari') || lowerCaseMsg.startsWith('.kategori') ||
                lowerCaseMsg === '.hari' || lowerCaseMsg === '.minggu' || lowerCaseMsg === '.bulan' ||
                lowerCaseMsg.startsWith('.edit') || lowerCaseMsg === '.stats' || lowerCaseMsg === '.export') {
                
                let initialReply = '⏳ Sedang diproses, mohon tunggu...';
                if(lowerCaseMsg === '3') initialReply = '⏳ Sedang mengambil data laporan...';
                if(lowerCaseMsg === '.terakhir') initialReply = '⏳ Sedang mengambil data transaksi terakhir...';
                if(lowerCaseMsg.startsWith('.hapus')) initialReply = '⏳ Sedang menghapus data...';
                if(lowerCaseMsg.startsWith('.cari')) initialReply = '🔍 Sedang mencari transaksi...';
                if(lowerCaseMsg.startsWith('.kategori')) initialReply = '📊 Sedang memfilter data...';
                if(lowerCaseMsg === '.hari' || lowerCaseMsg === '.minggu' || lowerCaseMsg === '.bulan') {
                    initialReply = '📈 Sedang menyiapkan laporan...';
                }
                if(lowerCaseMsg.startsWith('.edit')) initialReply = '✏️ Sedang menyiapkan data untuk edit...';
                if(lowerCaseMsg === '.stats') initialReply = '📊 Sedang menghitung statistik...';
                if(lowerCaseMsg === '.export') initialReply = '📄 Sedang menyiapkan export data...';

                twiml.message(initialReply);
                res.type('text/xml').send(twiml.toString());

                // Proses di latar belakang
                let finalReply = '';
                try {
                    if (lowerCaseMsg === '3') {
                        finalReply = await generateReport();
                    } else if (lowerCaseMsg === '.terakhir') {
                        finalReply = await getRecentTransactions();
                    } else if (lowerCaseMsg.startsWith('.hapus')) {
                        const parts = lowerCaseMsg.split(' ');
                        const numberToDelete = parseInt(parts[1], 10);
                        finalReply = await deleteTransaction(numberToDelete);
                    } else if (lowerCaseMsg.startsWith('.cari')) {
                        const keyword = msgBody.slice(6).trim(); // Remove '.cari '
                        if (!keyword) {
                            finalReply = 'Harap masukkan kata kunci pencarian.\nContoh: .cari gaji';
                        } else {
                            finalReply = await searchTransactions(keyword);
                        }
                    } else if (lowerCaseMsg.startsWith('.kategori')) {
                        const kategori = msgBody.slice(10).trim(); // Remove '.kategori '
                        if (!kategori) {
                            finalReply = 'Harap masukkan nama kategori.\nContoh: .kategori makanan';
                        } else {
                            finalReply = await getTransactionsByCategory(kategori);
                        }
                    } else if (lowerCaseMsg === '.hari') {
                        finalReply = await getReportByPeriod('hari');
                    } else if (lowerCaseMsg === '.minggu') {
                        finalReply = await getReportByPeriod('minggu');
                    } else if (lowerCaseMsg === '.bulan') {
                        finalReply = await getReportByPeriod('bulan');
                    } else if (lowerCaseMsg.startsWith('.edit')) {
                        const parts = lowerCaseMsg.split(' ');
                        const numberToEdit = parseInt(parts[1], 10);
                        const transaksi = await getTransactionForEdit(numberToEdit);
                        
                        if (transaksi) {
                            userState[from] = `EDIT_${transaksi.index}`;
                            const formatRp = (angka) => `Rp ${parseFloat(angka).toLocaleString('id-ID')}`;
                            finalReply = `✏️ Edit Transaksi #${numberToEdit}\n\n` +
                                        `Data saat ini:\n` +
                                        `📅 Tanggal: ${transaksi.tanggal}\n` +
                                        `📊 Jenis: ${transaksi.jenis}\n` +
                                        `🏷️ Kategori: ${transaksi.kategori}\n` +
                                        `💰 Jumlah: ${formatRp(transaksi.jumlah)}\n` +
                                        `📝 Keterangan: ${transaksi.keterangan}\n\n` +
                                        `Kirim data baru dengan format:\n` +
                                        `[jumlah] [kategori] [keterangan]\n\n` +
                                        `Contoh: 750000 Gaji Gaji bulan Februari`;
                        } else {
                            finalReply = `❌ Transaksi nomor ${numberToEdit} tidak ditemukan.`;
                        }
                    } else if (lowerCaseMsg === '.stats') {
                        finalReply = await getQuickStats();
                    } else if (lowerCaseMsg === '.export') {
                        finalReply = await exportDataToText();
                    }
                } catch (error) {
                    console.error('Error dalam proses background:', error);
                    finalReply = 'Maaf, terjadi kesalahan saat memproses permintaan Anda.';
                }
                
                await sendTwilioMessage(from, finalReply);
                return;
            }

            // Perintah yang bisa dibalas langsung
            switch (lowerCaseMsg) {
                case '1':
                    userState[from] = 'MENUNGGU_PEMASUKAN';
                    replyText = `💰 *CATAT PEMASUKAN*\n\n` +
                               `Format: [jumlah] [kategori] [keterangan]\n\n` +
                               `🏷️ Kategori tersedia:\n${KATEGORI_PEMASUKAN.join(', ')}\n\n` +
                               `📝 Contoh:\n\`500000 Gaji Gaji bulan Januari\`\n\`150000 Freelance Proyek website\``;
                    break;
                case '2':
                    userState[from] = 'MENUNGGU_PENGELUARAN';
                    replyText = `💸 *CATAT PENGELUARAN*\n\n` +
                               `Format: [jumlah] [kategori] [keterangan]\n\n` +
                               `🏷️ Kategori tersedia:\n${KATEGORI_PENGELUARAN.join(', ')}\n\n` +
                               `📝 Contoh:\n\`25000 Makanan Makan siang\`\n\`50000 Transport Bensin motor\``;
                    break;
                case '3':
                    // Tambahkan statistik cepat di sini
                    const quickStats = await getQuickStats();
                    replyText = `📊 *STATISTIK KEUANGAN ANDA* 📊\n\n` +
                                quickStats +
                                `\n\nKetik \`.menu\` untuk opsi lengkap.`;
                    break;
                case '4': // Alias untuk .terakhir
                    twiml.message('⏳ Sedang mengambil data transaksi terakhir...');
                    res.type('text/xml').send(twiml.toString());
                    const recentData = await getRecentTransactions();
                    await sendTwilioMessage(from, recentData);
                    return;
                default:
                    replyText = `❓ Perintah tidak dikenali.\n\n` +
                               `Ketik \`.menu\` untuk menu utama atau \`.bantuan\` untuk panduan lengkap.`;
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

// Health check endpoint
app.get('/', (req, res) => {
    res.json({
        status: 'active',
        message: 'Bot Keuangan Lengkap v2.0 is running!',
        features: [
            'Catat Pemasukan & Pengeluaran dengan Kategori',
            'Laporan Keuangan Lengkap',
            'Pencarian & Filter Transaksi',
            'Edit & Hapus Transaksi',
            'Laporan per Periode (Harian/Mingguan/Bulanan)',
            'Statistik Cepat',
            'Export Data'
        ],
        timestamp: new Date().toISOString()
    });
});

app.get('/status', (req, res) => {
    res.json({
        status: 'healthy',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString()
    });
});

app.listen(PORT, () => {
    console.log(`--> Server siap dan berjalan di port ${PORT}`);
    console.log(`--> Bot Keuangan Lengkap v2.0 telah aktif! 🚀`);
    
    // Inisialisasi header Google Sheets saat server mulai
    initializeSheet().then(() => {
        console.log(`--> Semua sistem siap! ✅`);
    }).catch(err => {
        console.error(`--> Error inisialisasi:`, err);
    });
});

async function exportDataToText() {
    const sheet = await loadSheet();
    const rows = await sheet.getRows();
    
    if (rows.length === 0) {
        return 'Tidak ada data untuk diekspor.';
    }

    let exportText = `📄 *EXPORT DATA KEUANGAN*\n`;
    exportText += `📅 Tanggal Export: ${new Date().toLocaleDateString('id-ID')}\n`;
    exportText += `📊 Total Transaksi: ${rows.length}\n\n`;
    exportText += `${'='.repeat(50)}\n\n`;

    let totalPemasukan = 0;
    let totalPengeluaran = 0;

    rows.forEach((row, index) => {
        const tanggal = row.get('Tanggal');
        const jenis = row.get('Jenis');
        const kategori = row.get('Kategori') || 'Tidak ada';
        const jumlah = parseFloat(row.get('Jumlah')) || 0;
        const keterangan = row.get('Keterangan');

        if (jenis === 'Pemasukan') {
            totalPemasukan += jumlah;
        } else {
            totalPengeluaran += jumlah;
        }

        exportText += `${index + 1}. 📅 ${tanggal}\n`;
        exportText += `   ${jenis === 'Pemasukan' ? '💰' : '💸'} [${jenis}] ${kategori}\n`;
        exportText += `   Rp ${jumlah.toLocaleString('id-ID')}\n`;
        exportText += `   📝 ${keterangan}\n\n`;
    });

    const saldo = totalPemasukan - totalPengeluaran;
    const formatRp = (angka) => `Rp ${angka.toLocaleString('id-ID')}`;

    exportText += `${'='.repeat(50)}\n`;
    exportText += `📊 *RINGKASAN:*\n`;
    exportText += `💰 Total Pemasukan: ${formatRp(totalPemasukan)}\n`;
    exportText += `💸 Total Pengeluaran: ${formatRp(totalPengeluaran)}\n`;
    exportText += `💵 Saldo: ${formatRp(saldo)}\n`;
    exportText += `${'='.repeat(50)}`;

    return exportText;
}