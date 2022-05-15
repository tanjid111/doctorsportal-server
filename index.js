const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.yohkc.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {
    try {
        await client.connect();
        const serviceCollection = client.db('doctor_portal').collection('services');
        const bookingCollection = client.db('doctor_portal').collection('bookings');
        /* 
        * API Naming Convention
        app.get('/booking') //get all bookings in this collection. or get more than one or by filter query
        app.get('/booking/:id')  // get a specific booking
        app.post('/booking/')  // add a new booking
        app.patch('/booking/:id')  // updating a specific booking
        app.delete('/booking/:id')  // delete a specific booking
        */

        app.get('/service', async (req, res) => {
            const query = {};
            const cursor = serviceCollection.find(query);
            const services = await cursor.toArray();
            res.send(services);
        });

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

        app.get('/booking', async (req, res) => {
            const patient = req.query.patient;
            const query = { patient: patient };
            bookings = await bookingCollection.find(query).toArray();
            res.send(bookings);
        })

        app.post('/booking', async (req, res) => {
            const booking = req.body;
            const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient }
            const exists = await bookingCollection.findOne(query);
            if (exists) {
                return res.send({ success: false, booking: exists })
            }
            const result = await bookingCollection.insertOne(booking);
            return res.send({ success: true, result });
        })
    }

    finally {

    }
}

run().catch(console.dir)

app.get('/', (req, res) => {
    res.send('Hello From Doctor Uncle!')
})

app.listen(port, () => {
    console.log(`Doctors App listening on port ${port}`)
})