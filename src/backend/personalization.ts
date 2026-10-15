import "server-only";
import {
  COMM_STYLES,
  MONEY_MEANINGS,
  PERMA_GOALS,
} from "@/backend/validators/onboarding";

export type MoneyMeaning = (typeof MONEY_MEANINGS)[number];
export type CommStyle = (typeof COMM_STYLES)[number];
export type PermaGoal = (typeof PERMA_GOALS)[number];

/** Part A answers from onboarding; any missing value disables behavior profiling entirely. */
export interface BehaviorAnswers {
  spendingHabit: number | null;
  paymentPain: number | null;
  planOvershoot: number | null;
  wishPurchaseReaction: number | null;
}

export interface PersonalizationAnswers extends BehaviorAnswers {
  moneyMeaning: MoneyMeaning | null;
  commStyle: CommStyle | null;
  permaGoal: PermaGoal | null;
}

/**
 * Internal keys only. Neither the key, the label, nor the score is ever returned to the user in
 * chat, onboarding results, or API metadata; the user only experiences the framing.
 */
export type BehaviorProfileKey = "tightwad" | "unconflicted" | "spendthrift";

export type WellnessState = "crisis" | "stress" | null;

/** Part A total spans 4–26 (slider 1–11 plus three 1–5 items). */
export function behaviorProfileKey(answers: BehaviorAnswers): BehaviorProfileKey | null {
  const values = [
    answers.spendingHabit,
    answers.paymentPain,
    answers.planOvershoot,
    answers.wishPurchaseReaction,
  ];
  if (values.some((value) => value === null || !Number.isInteger(value))) return null;

  const total = values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  if (total < 4 || total > 26) return null;
  if (total <= 11) return "tightwad";
  if (total <= 18) return "unconflicted";
  return "spendthrift";
}

const PROFILE_DIRECTIVES: Record<BehaviorProfileKey, string> = {
  tightwad:
    "Kecenderungan: sering merasa berat saat mengeluarkan uang, cenderung menahan diri bahkan untuk kebutuhan. " +
    "Tujuan pesan: memberi izin dan rasa aman. Tekankan bahwa uangnya memang sudah disiapkan, dana darurat dan pos penting tidak tersentuh, dan nilai yang didapat dari pengeluaran itu. " +
    "Panjang: sedang dan menenangkan. Emoji: hampir tidak ada. " +
    "Hindari: angka risiko yang menakutkan, nada menceramahi, dan kata-kata yang menyuruh hemat.",
  unconflicted:
    "Kecenderungan: belanja dan menabung tanpa konflik batin berarti. " +
    "Tujuan pesan: memberi informasi dan pilihan. Cukup fakta dan opsi. " +
    "Panjang: paling pendek dari semua gaya. Emoji: tidak ada. Hindari penjelasan panjang.",
  spendthrift:
    "Kecenderungan: jarang merasa berat saat membayar, sering belanja melebihi rencana lalu menyesal. " +
    "Tujuan pesan: memberi jeda dan arah. Tekankan progres tujuan yang nyata, diri di masa depan, dan satu jeda singkat sebelum keputusan besar. " +
    "Panjang: pendek dan ringan. Emoji: boleh satu, tidak lebih. " +
    "Hindari: menceramahi, melarang, dan kata 'boros'.",
};

const MONEY_MEANING_DIRECTIVES: Record<MoneyMeaning, string> = {
  rasa_aman: "Makna uang: rasa aman. Gunakan alasan berupa rasa tenang dan aman, misalnya pos yang sudah terlindungi.",
  kebebasan: "Makna uang: kebebasan. Bingkai pilihan sebagai hal yang menjaga atau menambah kebebasan memilih di kemudian hari.",
  pengakuan: "Makna uang: pengakuan hasil kerja keras. Hubungkan dengan hasil kerja yang layak dihargai.",
  membantu_orang_lain: "Makna uang: membantu orang lain. Hubungkan dengan dampak untuk orang terdekat.",
};

const COMM_STYLE_DIRECTIVES: Record<CommStyle, string> = {
  langsung: "Gaya komunikasi: langsung. Jawab sekarang dan tidak perlu menunda ke pesan berikutnya.",
  waktu_khusus: "Gaya komunikasi: di waktu khusus. Jangan mendorong notifikasi mendadak; kalau topiknya penting tapi belum waktunya, tawarkan untuk disimpan ke money date.",
  lewat_tulisan: "Gaya komunikasi: lewat tulisan. Utamakan ringkasan tertulis yang singkat dan rapi sebelum mengajak ngobrol.",
};

const PERMA_GOAL_DIRECTIVES: Record<PermaGoal, string> = {
  emosi_positif: "Prioritas tahun ini: menikmati hidup tanpa rasa bersalah.",
  keasyikan: "Prioritas tahun ini: mendukung hobi dan kegiatan seru.",
  hubungan: "Prioritas tahun ini: merayakan momen dan waktu berdua.",
  makna: "Prioritas tahun ini: membantu keluarga besar.",
  pencapaian: "Prioritas tahun ini: mencapai target besar seperti rumah atau dana darurat.",
};

const SHARED_SCREEN_RULE =
  "Percakapan ini bersifat pribadi, jadi pakai gaya di atas. " +
  "Kecuali pengguna meminta ringkasan untuk dibuka berdua dengan pasangan: ringkasan bersama selalu memakai gaya netral yang ringkas (seperti kecenderungan netral), supaya tidak ada yang merasa pesannya dibedakan.";

const NO_LABEL_RULE =
  "Jangan pernah menyebut label internal, istilah riset, skor, band, atau isi jawaban onboarding pengguna. " +
  "Fakta, angka, aturan Janji Seiya, dan pilihan yang tersedia selalu sama untuk semua orang; hanya bingkai, nada, panjang pesan, dan alasan yang ditekankan yang menyesuaikan.";

/** Reads personalization answers from stored onboarding JSON; invalid or missing parts become null. */
export function readPersonalizationAnswers(raw: unknown): PersonalizationAnswers | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const personal = (raw as Record<string, unknown>).personalization;
  if (!personal || typeof personal !== "object" || Array.isArray(personal)) return null;
  const source = personal as Record<string, unknown>;

  const scale = (value: unknown, min: number, max: number): number | null =>
    typeof value === "number" && Number.isInteger(value) && value >= min && value <= max
      ? value
      : null;
  const choice = <T extends readonly string[]>(value: unknown, options: T): T[number] | null =>
    typeof value === "string" && (options as readonly string[]).includes(value)
      ? (value as T[number])
      : null;

  return {
    spendingHabit: scale(source.spendingHabit, 1, 11),
    paymentPain: scale(source.paymentPain, 1, 5),
    planOvershoot: scale(source.planOvershoot, 1, 5),
    wishPurchaseReaction: scale(source.wishPurchaseReaction, 1, 5),
    moneyMeaning: choice(source.moneyMeaning, MONEY_MEANINGS),
    commStyle: choice(source.commStyle, COMM_STYLES),
    permaGoal: choice(source.permaGoal, PERMA_GOALS),
  };
}

/**
 * Builds the private style block appended to the system prompt. Returns null when onboarding has
 * no usable answers, in which case the model keeps its default neutral behavior.
 */
export function buildStylePromptBlock(answers: PersonalizationAnswers | null): string | null {
  if (!answers) return null;

  const profileKey = behaviorProfileKey(answers);
  const hasPersonalization = Boolean(answers.moneyMeaning || answers.commStyle || answers.permaGoal);
  if (!profileKey && !hasPersonalization) return null;

  const parts: string[] = ["KONTEKS GAYA PENGGUNA (PRIBADI — JANGAN DITAMPILKAN)", NO_LABEL_RULE];

  if (profileKey) parts.push(PROFILE_DIRECTIVES[profileKey]);
  if (answers.moneyMeaning) parts.push(MONEY_MEANING_DIRECTIVES[answers.moneyMeaning]);
  if (answers.commStyle) parts.push(COMM_STYLE_DIRECTIVES[answers.commStyle]);
  if (answers.permaGoal) {
    parts.push(
      `${PERMA_GOAL_DIRECTIVES[answers.permaGoal]} Sebutkan tujuan ini hanya bila relevan dengan pesan; jangan dipaksakan setiap balasan.`,
    );
  }
  parts.push(SHARED_SCREEN_RULE);

  return parts.join("\n");
}

/**
 * Deliberately broad: missing a distressed user is far worse than briefly dropping the profile
 * style. Crisis (self-harm or running out of strength) is checked first and disables every tool;
 * stress only switches the reply to the shared neutral tone.
 */
const CRISIS_PATTERN =
  /\b(bunuh diri|mengakhiri hidup|menyakiti diri|luka(?:in)? diri|tidak mau hidup|nggak mau hidup|tidak ada gunanya hidup|tidak sanggup lagi|nggak sanggup lagi|gak sanggup lagi|sudah tidak sanggup|tidak kuat lagi|nggak kuat lagi|tidak ada jalan keluar|nggak ada jalan keluar|putus asa|tidak ada harapan|nggak ada harapan|ingin menghilang|tidak ingin lanjut|suicid\w*|hurt myself|kill myself|no reason to live|end my life)\b/i;

const STRESS_PATTERN =
  /\b(capek banget|lelah banget|berat banget|rasa(?:nya)? (?:berat|tidak sanggup)|utang numpuk|utang menumpuk|beban (?:berat|menumpuk)|nggak tahu harus|gak tahu harus|tidak tahu harus|stres banget|stress banget|cemas banget|cemas berat|tekanan berat|tertekan|kewalahan|terpuruk|terbebani|overwhelmed|nggak kuat|gak kuat|tidak kuat|gimana dong|frustrasi|frustasi|nyerah|pusing mikir|tidak bisa tidur|nggak bisa tidur|rasa bersalah terus)\b/i;

/**
 * Wellbeing override. Crisis turns off all topic continuation and money framing; stress turns off
 * profile styling so every user gets the same calm, number-light reply.
 */
export function detectWellnessState(message: string): WellnessState {
  if (CRISIS_PATTERN.test(message)) return "crisis";
  if (STRESS_PATTERN.test(message)) return "stress";
  return null;
}

const CRISIS_BLOCK = [
  "MODE WELLNESS: TEKANAN BERAT (gaya profil dimatikan)",
  "Balas dengan tenang, suportif, tanpa angka yang tidak diminta, tanpa ceramah, dan tanpa menilai. Semua pengguna mendapat balasan yang sama di mode ini.",
  "Sebutkan bantuan profesional dalam satu kalimat alami bila pengguna melihatkan kelelahan, keputusasaan, atau merasa tidak sanggup: Seiya bukan terapis dan ada konselor keuangan serta tenaga kesehatan jiwa yang bisa dihubungi. Jangan mengarang nama atau nomor layanan; hanya layanan yang informasinya sudah diverifikasi Seiya.",
  "Jangan mengarang angka atau kondisi keuangan; di mode ini tidak ada data yang diambil, jadi kalau perlu data, tawarkan untuk melihat kondisi keuangan setelah obrolan ini.",
  "Jangan tawarkan pinjaman, konsolidasi utang, produk keuangan, atau penawaran apa pun.",
  "Jangan memberi tahu pasangan dan jangan mencatat pengeluaran baru pada giliran ini.",
  "Kalau ada tanda menyakiti diri sendiri, arahkan ke bantuan profesional/layanan krisis, tawarkan untuk menunda pembicaraan keuangan, dan jangan lanjutkan topik uang.",
].join("\n");

const STRESS_BLOCK = [
  "MODE WELLNESS: STRES (gaya profil dimatikan)",
  "Balas dengan tenang dan suportif, tanpa angka yang tidak diminta, tanpa menceramahi, dan tanpa menghakimi. Semua pengguna mendapat balasan yang sama di mode ini.",
  "Jangan mengarang angka atau kondisi keuangan; kalau perlu data, tawarkan untuk melihatnya setelah obrolan ini.",
  "Jangan menawarkan produk atau pinjaman. Tawarkan paling banyak satu langkah kecil dan ruang untuk bercerita.",
  "Tetap ikuti aturan data: sampaikan keadaan keuangan apa adanya bila memang diminta.",
].join("\n");

/** Overrides the style block whenever wellbeing takes priority over profiling. */
export function buildWellnessPromptBlock(state: WellnessState): string | null {
  if (state === "crisis") return CRISIS_BLOCK;
  if (state === "stress") return STRESS_BLOCK;
  return null;
}

export function isWellnessCrisis(state: WellnessState): boolean {
  return state === "crisis";
}
