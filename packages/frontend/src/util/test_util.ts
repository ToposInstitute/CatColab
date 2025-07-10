import { FirebaseError } from "firebase/app";
import {
    type Auth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
} from "firebase/auth";

/** Initialize a test user in Firebase auth. */
export async function initTestUserAuth(auth: Auth, email: string, password: string) {
    try {
        await createUserWithEmailAndPassword(auth, email, password);
    } catch (err) {
        if (err instanceof FirebaseError && err.code === "auth/email-already-in-use") {
            await signInWithEmailAndPassword(auth, email, password);
        } else {
            throw err;
        }
    }
}
