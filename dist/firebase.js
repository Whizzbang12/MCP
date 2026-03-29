import { initializeApp, cert } from "firebase-admin/app";
import dotenv from "dotenv";
dotenv.config();
initializeApp({
    credential: cert(JSON.parse(process.env.FB_ADMIN_JSON)),
});
