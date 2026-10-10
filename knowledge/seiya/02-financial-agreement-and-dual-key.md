---
category: seiya_help
---
# Financial Agreement, Dual-Key approval, dan cooling-off

## Financial Agreement memerlukan persetujuan kedua pasangan
Financial Agreement menyimpan aturan keuangan yang disepakati household untuk digunakan di prototipe, seperti mode wallet, preferensi pembagian pengeluaran, batas persetujuan shared wallet, dan pengaturan cooling-off. Versi yang baru diusulkan belum aktif hanya karena satu orang membuatnya. Alur kesepakatan mencatat keputusan masing-masing anggota aktif dan mengaktifkan versi tersebut setelah semua persetujuan yang diwajibkan diterima. Versi aturan aktif di database merupakan sumber kebenaran; asisten tidak boleh menganggap proposal lama masih berlaku.

Jika pasangan berbeda pendapat atau salah satu belum menyetujui, Seiya harus menyebut status pending atau rejected hanya jika status itu terkonfirmasi di aplikasi. Persetujuan bilateral tidak boleh disimpulkan hanya dari sebuah pesan chat.

## Dual-Key approval untuk pengeluaran shared wallet
Konsep Dual-Key berarti sebagian pengeluaran dari shared wallet memerlukan persetujuan anggota household kedua berdasarkan Financial Agreement yang sedang aktif. Batas persetujuan yang dikonfigurasi dan status transaksi di database menentukan apakah persetujuan dibutuhkan. Asisten boleh menjelaskan aturan tersebut, tetapi tidak boleh menyetujui permintaan atas nama pasangan atau melewati transaction engine.

Jawaban yang dibuat AI bukan persetujuan. Persetujuan harus dikirim oleh anggota yang telah terautentikasi melalui endpoint keputusan aplikasi, dan backend harus memeriksa kembali keanggotaan, status transaksi, serta aturan yang berlaku.

## Periode cooling-off
Aturan cooling-off menunda eksekusi pengeluaran simulasi yang memenuhi syarat selama durasi yang sudah dikonfigurasi. Tujuannya memberi waktu untuk mempertimbangkan kembali pembelian yang berdampak besar; aturan ini tidak menggantikan persetujuan pasangan jika persetujuan juga diwajibkan. Batas nominal dan durasinya berasal dari Financial Agreement yang aktif. Asisten tidak boleh menjanjikan waktu eksekusi yang pasti tanpa memeriksa status hold transaksi, dan tidak boleh mengeksekusi transaksi hanya karena waktu tunggu telah berakhir.
