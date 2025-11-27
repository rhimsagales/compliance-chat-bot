const admin = require('firebase-admin');
const dotenv = require('dotenv');
dotenv.config();

function getCredential() {
	const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64
		|| process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64
		|| process.env.SERVICE_ACCOUNT_BASE64;

	if (!b64) {
		throw new Error('Missing base64 service account JSON. Set FIREBASE_SERVICE_ACCOUNT_BASE64.');
	}

	let decoded;
	try {
		decoded = Buffer.from(b64, 'base64').toString('utf8');
	} catch (e) {
		throw new Error('Failed to decode base64 service account JSON.');
	}

	let serviceAccount;
	try {
		serviceAccount = JSON.parse(decoded);
	} catch (e) {
		throw new Error('Decoded service account is not valid JSON.');
	}

	return admin.credential.cert(serviceAccount);
}

if (!admin.apps.length) {
	const credential = getCredential();
	const databaseURL = process.env.FIREBASE_DATABASE_URL; 


	if (!databaseURL) {
		throw new Error('FIREBASE_DATABASE_URL is required for Firebase Realtime Database.');
	}

	admin.initializeApp({
		credential,
		databaseURL
	});
}


const database = admin.database();

module.exports = {
	admin,
	database
};
