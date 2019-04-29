const admin = require('firebase-admin');
const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const upload = multer();
const firebaseHelper = require('firebase-functions-helper');
const GeoFirestore = require("geofirestore").GeoFirestore;

const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

const serviceAccount = require('./firebase-credentials');

admin.initializeApp({
	credential: admin.credential.cert(serviceAccount),
	databaseURL: 'https://kazi80068.firebaseio.com',
	storageBucket: 'kazi-80068.appspot.com'
});

const db = admin.firestore();
const storage = admin.storage().bucket();
const geofirestore = new GeoFirestore(db);

const workersCollection = 'workers';
const servicesCollection = 'services';
const customersCollection = 'customers';
const trainingsCollection = 'trainings';
const imageCollection = 'images';
const jobCollection = 'jobs';

app.get("/api", (req, res) => {
	res.json({ test: "" });
});

app.get('/api/workers', (req, res) => {
	firebaseHelper.firestore
		.backup(db, workersCollection)
		.then(data => res.status(200).send(data))
});

app.post('/api/workers', (req, res) => {
	firebaseHelper.firestore
		.createNewDocument(db, workersCollection, req.body);
	res.send('Created new worker');
});

app.post('/api/workers/:id', (req, res) => {
	let worker = db.collection(workersCollection).doc(req.params.id).set(req.body, {merge: true});
	res.send('Worker updated');
});

app.get('/api/services', (req, res) => {
	firebaseHelper.firestore
		.backup(db, servicesCollection)
		.then(data => res.status(200).send(data))
});

// Create and update service
app.post('/api/services', (req, res) => {
	let id = req.body.id
	delete req.body.id;
	let service = db.collection(servicesCollection).doc(id).set(req.body, {merge: true});
	res.send('service created or updated');
});

app.get('/api/trainings', (req, res) => {
	firebaseHelper.firestore
		.backup(db, trainingsCollection)
		.then(data => res.status(200).send(data))
});

app.get('/api/customers', (req, res) => {
	firebaseHelper.firestore
		.backup(db, customersCollection)
		.then(data => res.status(200).send(data))
});

app.post('/api/customers', (req, res) => {
	const newCustomer = req.body;
	firebaseHelper.firestore
		.createNewDocument(db, customersCollection, newCustomer);
	res.json({ response: 'new customer created', new_customer: newCustomer });
});

function searchGeo(lat, lng) {
	const geocollection = geofirestore.collection(jobCollection);
	let center = new admin.firestore.GeoPoint(parseInt(lat), parseInt(lng));

	// Create a GeoQuery based on a location
	const query = geocollection.near({ center: center, radius: 10000 });

	return query;
}

// Find jobs
app.get('/api/jobs', (req, res) => {
	let data = []
	let query = searchGeo(req.query.lat, req.query.lng)
	if(req.query.service) {
		query = query.where('service_id', '==', req.query.service)
	}
	let result = query.get()
	  .then(snapshot => {
	    if (snapshot.empty) {
				res.send('We do not have jobs for your criteria')
	      return;
	    }

	    snapshot.forEach(doc => {
				data.push(doc.data())
	    });

			res.send(data);
			return;
	  })
	  .catch(err => {
	    console.log('Error getting documents', err);
			res.status(500).send({ error: 'Something failed!' });
			return;
	  });

});

// Create job
app.post('/api/jobs', (req, res) => {
	const geocollection = geofirestore.collection(jobCollection);
	const {
		description,
		start_date,
		end_date,
		latitude,
		longitude,
		service_id,
		price,
	} = req.body;

	const customer_id = req.body['messenger user id'];
	const first_name = req.body['first name'];

	let coordinates = new admin.firestore.GeoPoint(latitude, longitude);

	const job = {
		customer_id,
		description,
		start_date,
		end_date,
		coordinates,
		service_id,
		price
	};

	let p = geocollection.add(job);

	res.json({
		messages: [
			{ text: `Thank you very much ${first_name}, your job was created successfully. Bye!` }
		]
	});
});

app.post('/api/image', upload.array(), (req, res) => {
	const newPic = req.body.PICTURE;
	firebaseHelper.firestore
		.createNewDocument(db, imageCollection, { url: newPic });
	res.json({ response: 'new image created', new_customer: newPic });
});

app.listen(3000, () => console.log(`Example app listening on port 3000!`));
