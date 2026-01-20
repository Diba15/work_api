import { Elysia, t } from "elysia";
import { createClient } from "@supabase/supabase-js";
import { vercel } from '../src/vercel-adapter';
import { cors } from '@elysiajs/cors';

// Inisialisasi Supabase
const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

const app = new Elysia()


app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}))
  .use(vercel())
  .group("/api", (app) =>
    app
      /**
       * Menggunakan .guard() untuk membungkus semua route di bawahnya.
       * beforeHandle berfungsi sebagai penjaga (middleware) manual.
       */
      .guard({
        async beforeHandle({ headers, set }: any) {
          const authHeader = headers['authorization'];

          if (!authHeader || !authHeader.startsWith('Bearer ')) {
            set.status = 401;
            return { error: "Header Authorization tidak ditemukan atau format salah" };
          }

          const token = authHeader.replace('Bearer ', '');
          // Verifikasi token langsung ke Supabase
          const { data: { user }, error } = await supabase.auth.getUser(token);

          if (error || !user) {
            set.status = 401;
            return { error: "Sesi tidak valid atau telah berakhir" };
          }

          // Kita simpan user_id di metadata agar bisa diakses di handler bawah
          // (Elysia mengizinkan penambahan properti secara dinamis pada context)
          (arguments[0] as any).authenticatedUser = user;
        }
      }, (protectedApp) => protectedApp
        // GET: Mengambil data lamaran milik user yang terverifikasi
        .get("/jobs", async ({ set, authenticatedUser }: any) => {
          const { data, error } = await supabase
            .from("work_tables")
            .select("*")
            .eq('user_id', authenticatedUser.id) // Filter paksa berdasarkan ID user dari token
            .order("created_at", { ascending: false });

          if (error) { set.status = 500; return { error: error.message }; }
          return data;
        })

        // POST: Menambah lamaran baru
        .post("/jobs", async ({ body, set, authenticatedUser }: any) => {
          // Pastikan user_id yang disimpan adalah ID dari token, bukan kiriman frontend
          const payload = { ...body, user_id: authenticatedUser.id };

          const { data, error } = await supabase
            .from("work_tables")
            .insert([payload])
            .select();

          if (error) { set.status = 400; return { error: error.message }; }
          return data[0];
        }, {
          body: t.Object({
            company_name: t.String(),
            vacancy_url: t.Optional(t.String()),
            apply_date: t.String(),
            status: t.String(),
            notes: t.Optional(t.String())
          })
        })

        // PATCH: Mengupdate data lamaran
        .patch("/jobs/:id", async ({ params: { id }, body, set, authenticatedUser }: any) => {
          const { data, error } = await supabase
            .from("work_tables")
            .update(body)
            .eq("id", id)
            .eq("user_id", authenticatedUser.id) // Pastikan hanya bisa update milik sendiri
            .select();

          if (error) { set.status = 400; return { error: error.message }; }
          return data[0];
        })

        // DELETE: Menghapus data lamaran
        .delete("/jobs/:id", async ({ params: { id }, set, authenticatedUser }: any) => {
          const { error } = await supabase
            .from("work_tables")
            .delete()
            .eq("id", id)
            .eq("user_id", authenticatedUser.id); // Keamanan tambahan

          if (error) { set.status = 400; return { error: error.message }; }
          return { message: "Data berhasil dihapus" };
        })
      )
  );

export const GET = app.handle;
export const POST = app.handle;
export const PATCH = app.handle;
export const DELETE = app.handle;
export const OPTIONS = app.handle;

if (process.env.NODE_ENV !== 'production') {
  app.listen(3000);
}