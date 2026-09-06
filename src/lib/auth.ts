import { GoogleAuthProvider, signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth'
import { auth } from './firebase'

const googleProvider = new GoogleAuthProvider()

export async function signInWithGoogle() {
  await signInWithPopup(auth, googleProvider)
}

export async function signOut() {
  await firebaseSignOut(auth)
}
