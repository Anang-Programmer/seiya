---
category: seiya_help
---
# Budget dan tagihan household di Seiya

## Apa yang dihitung dalam ringkasan budget
Pada prototipe Seiya saat ini, progres budget dihitung dari pengeluaran yang berstatus executed, tercatat terhadap shared wallet, dan cocok dengan kategori serta periode budget. Transaksi pending, rejected, atau on-hold belum dihitung sebagai pengeluaran selesai. Pengeluaran dari personal wallet tidak termasuk dalam ringkasan budget bersama ini, dan nominal dalam mata uang berbeda tidak otomatis dikonversi ke satu mata uang. Sisa budget adalah nominal anggaran dikurangi pengeluaran executed yang masuk perhitungan, sedangkan status over-budget mengikuti hasil perhitungan tersebut.

Ringkasan budget adalah gambaran data prototipe yang tercatat, bukan perkiraan dan bukan jaminan bahwa household memiliki jumlah tersebut sebagai uang tunai. Untuk pertanyaan saldo aktual, gunakan tool wallet secara terpisah. Jangan menganggap uang yang belum tercatat, pengeluaran pribadi, atau tagihan mendatang sudah masuk ke total pengeluaran budget.

## Status tagihan dan tagihan berulang
Seiya menyimpan nominal, tanggal jatuh tempo, status, dan metadata pengulangan (recurrence) suatu tagihan. Tagihan berstatus upcoming belum sama dengan pembayaran yang sudah selesai. Jika database menyebut tagihan paid, jangan menyebutnya belum dibayar; percobaan pembayaran yang gagal atau masih menunggu keputusan yang diwajibkan juga tidak boleh disebut sudah selesai.

Pada MVP saat ini, recurrence baru berupa metadata dan belum otomatis membuat tagihan untuk periode berikutnya. Pengguna tidak boleh menganggap bahwa setelah satu tagihan bulanan dibayar, tagihan bulan depan sudah dibuat otomatis. Untuk pertanyaan tentang nominal, tanggal, dan status tagihan, asisten harus mengambil data tagihan terkini, bukan menjawab detail tersebut hanya dari dokumen statis ini.
