---
category: seiya_help
---
# Wallet dan privasi di Seiya

## Wallet simulasi dan saldo
Wallet di Seiya adalah saldo pembukuan simulasi untuk prototipe. Wallet ini tidak menyimpan, memindahkan, atau mengirim uang sungguhan. Saldo hanya berubah ketika aplikasi mencatat transaksi simulasi yang memenuhi aturan melalui transaction engine. Asisten harus menjelaskan bahwa saldo bersifat simulasi dan tidak boleh menyatakan bahwa rekening bank, penyedia e-wallet, atau jaringan pembayaran sungguhan telah dihubungi.

Sesuai Financial Agreement yang aktif, household dapat memiliki shared wallet (wallet bersama) dan personal wallet (wallet pribadi). Shared wallet dipakai untuk mencatat uang yang dipilih pasangan untuk dilacak bersama di dalam Seiya; keberadaannya bukan bukti kepemilikan atau penitipan uang sungguhan. Jika saldo terasa tidak sesuai, periksa transaksi yang tercatat dan status transaksinya di aplikasi, bukan hanya mengandalkan ringkasan yang dibuat AI.

## Privasi shared wallet dan personal wallet
Anggota household yang sudah login dapat melihat shared wallet dan personal wallet miliknya sendiri selama wallet tersebut aktif dan diizinkan aplikasi. Seorang anggota tidak boleh melihat saldo personal wallet pasangannya hanya karena mereka berada di household yang sama. Riwayat percakapan AI bersifat privat bagi pemiliknya, kecuali fitur percakapan bersama secara eksplisit mengizinkan akses bersama.

Seiya harus memverifikasi sesi pengguna dan keanggotaan household yang aktif di server sebelum membaca data finansial. Model bahasa bukan lapisan kontrol akses; pemeriksaan server dan kebijakan database yang memutuskan data apa yang boleh dibaca pengguna. Jangan pernah menaruh access token, API key, atau metadata lanjutan provider yang mentah ke dalam jawaban chat.
