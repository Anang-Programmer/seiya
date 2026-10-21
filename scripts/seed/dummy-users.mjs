
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.SEIYA_DUMMY_PASSWORD;

// Pengaman agar script hanya berjalan untuk project development Seiya ini.
const expectedProjectRef = "rtbcbbfkeocetbdvaemj";

if (!supabaseUrl || !secretKey || !password) {
  throw new Error(
    "Missing Supabase URL, Secret Key, or SEIYA_DUMMY_PASSWORD in .env.local"
  );
}

const hostname = new URL(supabaseUrl).hostname;

if (!hostname.startsWith(`${expectedProjectRef}.`)) {
  throw new Error(
    "Wrong Supabase project. Dummy seeding has been stopped."
  );
}

const supabase = createClient(supabaseUrl, secretKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const dummyUsers = [
  { email: "suami@gmail.com", fullName: "Suami Demo" },
  { email: "istri@gmail.com", fullName: "Istri Demo" },
];

async function seedDummyUsers() {
  const { data, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (error) throw error;

  for (const user of dummyUsers) {
    const existingUser = data.users.find(
      (item) =>
        item.email?.toLowerCase() === user.email.toLowerCase()
    );

    if (existingUser) {
      console.log(`SKIP: ${user.email} already exists.`);
      continue;
    }

    const { data: created, error: createError } =
      await supabase.auth.admin.createUser({
        email: user.email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: user.fullName,
        },
      });

    if (createError) {
      console.error(`FAILED: ${user.email} — ${createError.message}`);
      continue;
    }

    console.log(`CREATED: ${created.user.email}`);
    console.log(`User ID: ${created.user.id}`);
  }
}

seedDummyUsers().catch((error) => {
  console.error("Dummy user seeding failed:", error.message);
  process.exitCode = 1;
});
