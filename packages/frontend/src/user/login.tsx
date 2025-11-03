import { type SubmitHandler, createForm, email, minLength, required } from "@modular-forms/solid";
import {
    GithubAuthProvider,
    GoogleAuthProvider,
    type User,
    type UserCredential,
    createUserWithEmailAndPassword,
    getAuth,
    signInWithEmailAndPassword,
    signInWithPopup,
} from "firebase/auth";
import { useAuth, useFirebaseApp } from "solid-firebase";
import { type JSX, Match, Switch } from "solid-js";
import invariant from "tiny-invariant";

import { Button, IconButton } from "catcolab-ui-components";
import { useApi } from "../api";

import SignInIcon from "lucide-solid/icons/log-in";
import SignUpIcon from "lucide-solid/icons/user-pen";

import "./login.css";

type EmailAndPassword = {
    email: string;
    password: string;
};

/** Form to log in using Firebase auth. */
export function Login(props: {
    onComplete?: (user: User) => void;
}) {
    const api = useApi();
    const firebaseApp = useFirebaseApp();

    const [, { Form, Field }] = createForm<EmailAndPassword>();

    const onSubmit: SubmitHandler<EmailAndPassword> = (values, event) => {
        const submitter = event.submitter as HTMLButtonElement;
        if (submitter.value === "sign-in") {
            return signIn(values);
        } else if (submitter.value === "sign-up") {
            return signUp(values);
        } else {
            throw new Error(`Unrecognized submitter: ${submitter.value}`);
        }
    };

    const signIn = async (values: EmailAndPassword) => {
        const { email, password } = values;
        const cred = await signInWithEmailAndPassword(getAuth(firebaseApp), email, password);
        await completeSignUpOrSignIn(cred);
    };

    const signUp = async (values: EmailAndPassword) => {
        const { email, password } = values;
        const cred = await createUserWithEmailAndPassword(getAuth(firebaseApp), email, password);
        await completeSignUpOrSignIn(cred);
    };

    const signInWithGoogle = async () => {
        const provider = new GoogleAuthProvider();
        const cred = await signInWithPopup(getAuth(firebaseApp), provider);
        await completeSignUpOrSignIn(cred);
    };

    const signInWithGitHub = async () => {
        const provider = new GithubAuthProvider();
        const cred = await signInWithPopup(getAuth(firebaseApp), provider);
        await completeSignUpOrSignIn(cred);
    };

    const completeSignUpOrSignIn = async (cred: UserCredential) => {
        props.onComplete?.(cred.user);
        const result = await api.rpc.sign_up_or_sign_in.mutate();
        invariant(result.tag === "Ok");
    };

    return (
        <div class="login">
            <Form onSubmit={onSubmit}>
                <Field
                    name="email"
                    validate={[
                        required("Please enter an email address."),
                        email("The email address is invalid."),
                    ]}
                >
                    {(field, props) => (
                        <>
                            <input
                                {...props}
                                type="email"
                                required
                                value={field.value}
                                placeholder="Email address"
                            />
                            {field.error && <div class="error">{field.error}</div>}
                        </>
                    )}
                </Field>
                <Field
                    name="password"
                    validate={[
                        required("Please enter a password."),
                        minLength(6, "The password must be at least 6 characters long."),
                    ]}
                >
                    {(field, props) => (
                        <>
                            <input
                                {...props}
                                type="password"
                                required
                                value={field.value}
                                placeholder="Password"
                            />
                            {field.error && <div class="error">{field.error}</div>}
                        </>
                    )}
                </Field>
                <div class="buttons">
                    <Button type="submit" variant="primary" value="sign-in">
                        <SignInIcon />
                        Login
                    </Button>
                    <Button type="submit" variant="primary" value="sign-up">
                        <SignUpIcon />
                        Sign up
                    </Button>
                </div>
            </Form>
            <div class="separator">{"Or continue with"}</div>
            <div class="provider-list">
                <IconButton onClick={signInWithGoogle} tooltip="Login with Google">
                    <img
                        height="28"
                        width="28"
                        src="https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/google.svg"
                    />
                </IconButton>
                <IconButton onClick={signInWithGitHub} tooltip="Login with GitHub">
                    <img
                        height="28"
                        width="28"
                        src="https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/github.svg"
                    />
                </IconButton>
            </div>
        </div>
    );
}

/** Content gated by a login panel.

If the user is logged in, the children of this component will be displayed;
otherwise, a login panel is shown.
 */
export function LoginGate(props: {
    children: JSX.Element;
}) {
    const firebaseApp = useFirebaseApp();
    const auth = useAuth(getAuth(firebaseApp));

    return (
        <Switch>
            <Match when={!auth.loading && !auth.data}>
                <div class="login-gate">
                    <p>{"To access this page, please log in."}</p>
                    <Login />
                </div>
            </Match>
            <Match when={auth.data}>{props.children}</Match>
        </Switch>
    );
}
