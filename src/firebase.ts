import {credential} from "firebase-admin"
import {initializeApp} from "firebase-admin/app"
import dotenv from "dotenv"

dotenv.config()

initializeApp({
    credential: credential.cert(JSON.parse(process.env.FB_ADMIN_JSON!)),
})