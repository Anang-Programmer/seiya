# Panduan Transisi Frontend: Menghilangkan Akses Simulasi & Demo saat Backend Selesai

Dokumen ini adalah panduan referensi cepat (*checklist & SOP*) untuk tim developer ketika salah satu fitur backend telah selesai dikerjakan dan siap dihubungkan ke UI frontend. 

Setiap kali fitur backend riil aktif, **tombol simulasi, helper demo, mock button, dan bypass manual** pada fitur tersebut harus dinonaktifkan atau dihapus agar aplikasi berjalan murni menggunakan data dan API backend riil.

---

## 1. Feature: Partner Connection & Onboarding Pairing
*Ketika backend pairing/invitation API sudah terintegrasi:*
- **File Target:** `src/components/views/auth-view.tsx`
- **Bagian yang Dihapus / Disembunyikan:**
  1. **Simulate Partner Connecting Button:**
     - Cari blok `Simulation helper button for testing/demo` (sekitar baris 2030–2045).
     - Hapus tombol:
       ```tsx
       <button onClick={() => setPartnerConnected(!partnerConnected)}>
         {partnerConnected ? "Simulate Disconnect" : `⚡ Simulate ${activePartnerBName} Connecting`}
       </button>
       ```
  2. **Ganti dengan Logic Realtime Backend:**
     - Status koneksi `partnerConnected` diambil dari listener websocket/polling Supabase realtime table `household_invitations` atau `households`.
     - Ketika partner menerima invite via kode/URL, state `partnerConnected` berubah otomatis secara riil dari event backend.

---

## 2. Feature: Dual Agreement & Digital Signatures (Couple Contract)
*Ketika backend smart contract / dual signature API sudah terintegrasi:*
- **File Target:** `src/components/views/auth-view.tsx`
- **Bagian yang Dihapus / Disembunyikan:**
  1. **Sign Both (Fast Demo) Shortcut:**
     - Cari blok alert mutual consent (sekitar baris 2650–2665).
     - Hapus tombol demo:
       ```tsx
       <button onClick={() => { setContractPartnerASigned(true); setContractPartnerBSigned(true); }}>
         Sign Both (Fast Demo)
       </button>
       ```
  2. **Simulasi Signature Partner B:**
     - Hapus tombol simulate signature Partner B:
       ```tsx
       <button onClick={() => setContractPartnerBSigned(!contractPartnerBSigned)}>
         Sign as {activePartnerBName} (Simulate)
       </button>
       ```
  3. **Ganti dengan Real Dual Signature Flow:**
     - User yang sedang login hanya bisa menandatangani sisi profil miliknya.
     - Tanda tangan partner kedua menunggu partner login di akun/perangkatnya sendiri dan memanggil endpoint `/api/households/finance-rules` / approval contract.

---

## 3. Feature: Auth Login & Quick Demo User
*Ketika Supabase Auth sudah live dan tidak memerlukan akses bypass demo:*
- **File Target:** `src/components/views/auth-view.tsx` & `src/components/views/landing-view.tsx`
- **Bagian yang Dihapus / Disembunyikan:**
  1. **Landing Page Direct Demo Buttons:**
     - Hapus tombol `Direct Demo: Alex` dan `Direct Demo: Morgan` di `src/components/views/landing-view.tsx`.
  2. **Quick Demo Fill in Auth View:**
     - Hapus badge/tombol klik cepat `Quick demo: Alex Chen` / `Morgan Smith` di login form `src/components/views/auth-view.tsx`.

---

## 4. Feature: Transactions, Decision, & Execution
*Ketika RPC database transaction engine & approval backend aktif:*
- **File Target:** `src/components/views/chat-view.tsx` & `src/components/views/home-view.tsx`
- **Bagian yang Dihapus / Disembunyikan:**
  1. **Artificial Delay & Mock Simulation:**
     - Hapus `setTimeout` simulasi delay "Checking rules..." di `chat-view.tsx` (sekitar baris 520–540).
     - Panggil langsung API backend `/api/transactions` dan `/api/transactions/[transactionId]/decision`.
  2. **Badge Simulated:**
     - Hapus status `simulated` pada badge status transaksi di `src/components/ui/badge.tsx` jika saldo dan ledger sudah tersimpan permanen di database.

---

## 5. Feature: Settings, Demo Fixtures, & FX Rate Missing Test
*Ketika data riil dari Webank / bank partner sudah live:*
- **File Target:** `src/components/views/settings-view.tsx` & `src/lib/store.tsx`
- **Bagian yang Dihapus / Disembunyikan:**
  1. **Demonstration Fixtures Card:**
     - Hapus opsi preset demo: `applyDemoPreset("global_usd")` dan `applyDemoPreset("regional_idr")`.
  2. **Simulate Missing Exchange Rate Toggle:**
     - Hapus saklar toggle `Test Scenario: Simulate Missing Exchange Rate` di settings.

---

## Ringkasan Perintah Flagging (Opsional Best Practice)
Jika ingin mematikan fitur simulasi secara instan tanpa menghapus kode sekaligus, gunakan environment variable di `.env.local`:

```bash
NEXT_PUBLIC_ENABLE_DEMO_SIMULATION=false
```

Dan bungkus tombol-tombol simulasi di atas dengan kondisi:
```tsx
{process.env.NEXT_PUBLIC_ENABLE_DEMO_SIMULATION === "true" && (
  /* Tombol / Panel Simulasi */
)}
```
Dengan begitu, begitu production/backend siap, cukup set nilai ke `false` maka seluruh akses simulasi otomatis hilang di seluruh aplikasi.
