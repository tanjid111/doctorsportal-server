const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');

require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
var nodemailer = require('nodemailer');
var sgTransport = require('nodemailer-sendgrid-transport');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.yohkc.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        res.status(401).send({ message: 'Unauthorized Access' });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'Forbidden Access' })
        }
        req.decoded = decoded;
        next();
    });
}

const emailSenderOptions = {
    auth: {
        api_key: process.env.EMAIL_SENDER_KEY
    }
}

const emailClient = nodemailer.createTransport(sgTransport(emailSenderOptions));

function sendAppointmentEmail(booking) {
    const { patient, patientName, treatment, date, slot } = booking;

    var email = {
        from: process.env.EMAIL_SENDER,
        to: patient,
        subject: `Your appointment for ${treatment} is on ${date} at ${slot} is confirmed`,
        text: `Your appointment for ${treatment} is on ${date} at ${slot} is confirmed`,
        html: `
        <div>
        <p>Hello ${patientName},</p>
        <h3>Your appointment for ${treatment} is confirmed.</h3>
        <p>Looking forward to seeing you on ${date} at ${slot}</p>
        <h3>Our Address</h3>
        <p>Dhanmondi R/A</p>
        <p>Bangladesh</p>
        <p href="https://web.programming-hero.com/">unsubscribe</p>
        
        </div>
        
        `
    };

    emailClient.sendMail(email, function (err, info) {
        if (err) {
            console.log(err);
        }
        else {
            console.log('Message sent: ', info);
        }
    });
}

function sendPaymentConfirmationEmail(booking) {
    const { patient, patientName, treatment, date, slot } = booking;

    var email = {
        from: process.env.EMAIL_SENDER,
        to: patient,
        subject: `We have received your payment for ${treatment} on ${date} at ${slot} is confirmed`,
        text: `Your payment for this appointment ${treatment} on ${date} at ${slot} is confirmed`,
        html: `
        <div>
        <p>Hello ${patientName},</p>
        <h3>Thank you for your payment.</h3>
        <h3>We have received your payment.</h3>
        <p>Looking forward to seeing you on ${date} at ${slot}</p>
        <h3>Our Address</h3>
        <p>Dhanmondi R/A</p>
        <p>Bangladesh</p>
        <p href="https://web.programming-hero.com/">unsubscribe</p>
        
        </div>
        
        `
    };

    emailClient.sendMail(email, function (err, info) {
        if (err) {
            console.log(err);
        }
        else {
            console.log('Message sent: ', info);
        }
    });
}

async function run() {
    try {
        await client.connect();
        const serviceCollection = client.db('doctor_portal').collection('services');
        const bookingCollection = client.db('doctor_portal').collection('bookings');
        const userCollection = client.db('doctor_portal').collection('users');
        const doctorCollection = client.db('doctor_portal').collection('doctors');
        const paymentCollection = client.db('doctor_portal').collection('payments');
        /* 
        * API Naming Convention
        app.get('/booking') //get all bookings in this collection. or get more than one or by filter query
        app.get('/booking/:id')  // get a specific booking
        app.post('/booking/')  // add a new booking
        app.patch('/booking/:id')  // updating a specific booking
        app.put('/booking/:id')  // upsert ==> update (if exists) or insert (if doesn't exist)
        app.delete('/booking/:id')  // delete a specific booking
        */
        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester })
            if (requesterAccount.role === 'admin') {
                next();
            }
            else {
                res.status(403).send({ message: 'forbidden' });
            }
        }

        app.get('/service', async (req, res) => {
            const query = {};
            const cursor = serviceCollection.find(query).project({ name: 1 });
            const services = await cursor.toArray();
            res.send(services);
        });

        app.get('/user', verifyJWT, async (req, res) => {
            const users = await userCollection.find().toArray();
            res.send(users)
        })

        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email: email });
            const isAdmin = user.role === 'admin';
            res.send({ admin: isAdmin })
        })

        app.put('/user/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;

            const filter = { email: email };
            const updatedDoc = {
                $set: { role: 'admin' },
            };
            const result = await userCollection.updateOne(filter, updatedDoc);
            res.send(result);


        })

        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updatedDoc = {
                $set: user,
            };
            const result = await userCollection.updateOne(filter, updatedDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
            res.send({ result, token });
        })

        //WARNING:
        //this is not the proper way to query. I just wanted to try it out with JS
        //after learning more about mongodb. I will use aggregate lookup, pipeline, match, group

        app.get('/available', async (req, res) => {
            const date = req.query.date;

            //step 1: get all services
            const services = await serviceCollection.find().toArray();

            //step 2: get the booking of that day
            const query = { date: date };
            bookings = await bookingCollection.find(query).toArray();

            //step3: for each service, find bookings for that service
            services.forEach(service => {

                //step4: find bookings for each service
                const serviceBookings = bookings.filter(b => b.treatment === service.name);
                //step5: select slots for the service bookings
                const booked = serviceBookings.map(s => s.slot)
                // service.booked = booked; 
                // service.booked = serviceBookings.map(s => s.slot);
                //step6: select those that are not in bookedslots
                const available = service.slots.filter(s => !booked.includes(s));

                //Step7: Set available to slots to make it easier
                service.slots = available;
                // service.available = available;
            })

            res.send(services);
        })

        app.get('/booking', verifyJWT, async (req, res) => {
            const patient = req.query.patient;
            // const authorization = req.headers.authorization; declaring function at the top
            // console.log('auth header', authorization);
            decodedEmail = req.decoded.email;
            if (patient === decodedEmail) {
                const query = { patient: patient };
                bookings = await bookingCollection.find(query).toArray();
                return res.send(bookings);
            }
            else {
                return res.status(403).send({ message: 'forbidden access' })
            }
        })

        app.get('/booking/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const booking = await bookingCollection.findOne(query);
            res.send(booking);
        })

        app.post('/booking', async (req, res) => {
            const booking = req.body;
            const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient }
            const exists = await bookingCollection.findOne(query);
            if (exists) {
                return res.send({ success: false, booking: exists })
            }
            const result = await bookingCollection.insertOne(booking);
            console.log('sending email');
            sendAppointmentEmail(booking);
            return res.send({ success: true, result });
        })

        //update booking with payment and payment id
        app.patch('/booking/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const payment = req.body;
            const filter = { _id: ObjectId(id) };
            const updatedDoc = {
                $set: {
                    paid: true,
                    transactionId: payment.transactionId
                }
            };
            //sending payment info to db
            const result = await paymentCollection.insertOne(payment);
            const updatedBooking = await bookingCollection.updateOne(filter, updatedDoc)
            res.send(updatedBooking);
        })

        app.get('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
            const doctors = await doctorCollection.find().toArray();
            res.send(doctors);
        })

        app.post('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
            const doctor = req.body;
            const result = await doctorCollection.insertOne(doctor);
            res.send(result)
        })

        app.delete('/doctor/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const result = await doctorCollection.deleteOne(filter);
            res.send(result)
        })

        app.post('/create-payment-intent', verifyJWT, async (req, res) => {
            const service = req.body;
            const price = service.price
            const amount = price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });
            res.send({ clientSecret: paymentIntent.client_secret })
        });
    }

    finally {

    }
}

run().catch(console.dir)

app.get('/', (req, res) => {
    res.send('Doctors app is running!')
})

app.listen(port, () => {
    console.log(`Doctors App listening on port ${port}`)
})
//