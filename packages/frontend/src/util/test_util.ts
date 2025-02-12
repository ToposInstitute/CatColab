import { FirebaseError } from "firebase/app";
import {
    type Auth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
} from "firebase/auth";

export async function initTestUserAuth(auth: Auth, email: string, password: string) {
    try {
        await createUserWithEmailAndPassword(auth, email, password);
    } catch (e) {
        if (e instanceof FirebaseError && e.code === "auth/email-already-in-use") {
            await signInWithEmailAndPassword(auth, email, password);
        } else {
            throw e;
        }
    }
}
