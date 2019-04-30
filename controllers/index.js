const admin = require('firebase-admin');
const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const upload = multer();
const firebaseHelper = require('firebase-functions-helper');
const GeoFirestore = require("geofirestore").GeoFirestore;

const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));

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
	res.json({test: ""});
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
		.then(data => res.send(data))
});

// Create and update service
app.post('/api/services', (req, res) => {
	let id = req.body.id;
	delete req.body.id;
	let service = db.collection(servicesCollection).doc(id).set(req.body, {merge: true});
	res.send('service created or updated');
});

app.get('/api/trainings', (req, res) => {
	firebaseHelper.firestore
		.backup(db, trainingsCollection)
		.then((data) => {
			let template = buildTrainingCarrouselTemplate(data.trainings);
			res.send(template);
		})
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
	res.json({response: 'new customer created', new_customer: newCustomer});
});

/**
 * Search for jobs
 * Will always search geolocated using query params for lat and lng
 * Can also receive a query string for service
 */
app.get('/api/jobs', (req, res) => {
	console.log(req.query);
	let data = [];
	let query = searchGeo(req.query.latitude, req.query.longitude, req.query.radius || undefined);
	if (req.query.service_id_search && req.query.service_id_search !== 'undefined') {
		query = query.where('service_id', '==', req.query.service_id_search)
	}
	let result = query.get()
		.then(snapshot => {
			if (snapshot.empty) {
				res.send({
					messages: [
						{
							text: 'We do not have jobs for your criteria'
						}
					]
				});
				return;
			}

			snapshot.forEach(doc => {
				data.push({id: doc.id, ...doc.data()})
			});

			let template = buildJobCarrouselTemplate(data);
			res.send(template);

		})
		.catch(err => {
			console.log('Error getting documents', err);
			res.send({
				messages: [
					{
						text: 'Something failed!'
					}
				]
			});
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

	let coordinates = new admin.firestore.GeoPoint(parseFloat(latitude), parseFloat(longitude));

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
			{
				text: `Thank you very much ${first_name}, your job was created successfully. Bye!`
			}
		]
	});
});

// Update a job
app.post('/api/jobs/:id', (req, res) => {
	let job = db.collection(jobCollection).doc(req.params.id).set(req.body, {merge: true});
	res.send({
		messages: [
			{
				text: 'The job details were updated!'
			}
		]
	});
});

app.get('/api/jobs/:id', (req, res) => {
	let job = db.collection(jobCollection).doc(req.params.id).get()
		.then(doc => {
			if (!doc.exists) {
				res.send({
					messages: [
						{
							text: 'The job does not exist'
						}
					]
				})
			} else {
				console.log('Document data:', doc.data());
				let template = buildJobDetailTemplate(doc.data().d);
				res.send(template);
			}
		})
		.catch(err => {
			console.log('Error getting document', err);
			res.send({
				messages: [
					{
						text: 'Something failed!'
					}
				]
			});
		});
});

// Add applicants for a job
app.post('/api/jobs/:jobId/apply/:applicantId', (req, res) => {
	let job = db.collection(jobCollection).doc(req.params.jobId).get()
		.then(doc => {
			if (!doc.exists) {
				res.send({
					messages: [
						{
							text: 'The job does not exist'
						}
					]
				})
			} else {
				let data = {};
				let applicants = doc.data().d.applicants || [];
				applicants.push(req.params.applicantId);
				console.log(applicants);
				data.d = {
					applicants,
				};
				db.collection(jobCollection).doc(req.params.jobId).set(data, {merge: true});
				res.send({
					messages: [
						{
							text: 'Applicant added to the job'
						}
					]
				});
			}
		})
		.catch(err => {
			console.log('Error getting document', err);
			res.send({
				messages: [
					{
						text: 'Something failed!'
					}
				]
			});
		});
});

app.post('/api/image', upload.array(), (req, res) => {
	const newPic = req.body.PICTURE;
	firebaseHelper.firestore
		.createNewDocument(db, imageCollection, {url: newPic});
	res.json({response: 'new image created', new_customer: newPic});
});

function searchGeo(lat, lng, dist = 1000) {
	const geocollection = geofirestore.collection(jobCollection);
	let center = new admin.firestore.GeoPoint(parseFloat(lat), parseFloat(lng));

	// Create a GeoQuery based on a location
	const query = geocollection.near({center: center, radius: parseFloat(dist)});

	return query;
}

function buildJobDetailTemplate(data) {
	return data;
}

function buildJobCarrouselTemplate(data) {
	let cards = data.map(job => {
		return {
			title: `Job Type: ${job.service_id}`,
			'image_url': job.service_img_url,
			subtitle: job.description.substring(0, 79),
			buttons: [
				{
					'set_attributes': {
						"show_issue_details": job.customer_id,
						"job_id": job.id
					},
					"block_names": ["Show more details"],
					type: "show_block",
					title: "Show More Details"
				},
				{
					'set_attributes': {
						"job_id": job.id
					},
					"block_names": ["I want to apply"],
					type: "show_block",
					title: "I want to apply"
				}
			]
		}
	});

	return {
		messages: [
			{
				attachment: {
					type: 'template',
					payload: {
						'template_type': 'generic',
						'image_aspect_ration': 'square',
						elements: cards
					}
				}
			}
		]
	};
}

function buildTrainingCarrouselTemplate(data) {
	let cards = [];
	for (key in data) {
		cards.push({
			media_type: "image",
			url: data[key].media_url,
			buttons: [
				{
					"type": "web_url",
					"url": data[key].web_url,
					"title": "View Training",
				}
			]
		})
	}

	return {
		messages: [
			{
				attachment: {
					type: 'template',
					payload: {
						'template_type': 'generic',
						'image_aspect_ration': 'square',
						elements: cards
					}
				}
			}
		]
	};
}


app.listen(3000, () => console.log(`Example app listening on port 3000!`));
