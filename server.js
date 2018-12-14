'use strict';

// Application Dependencies
const express = require('express');
const cors = require('cors');
const superagent = require('superagent');
const pg = require('pg');

//postgres
const client = new pg.Client(process.env.DATABASE_URL);
client.connect();
client.on('error', err => console.error(err));

// Load env vars;
require('dotenv').config();
const PORT = process.env.PORT || 3000;

// App
const app = express();
app.use(cors());

// Routes
app.get('/location', getLocation)
app.get('/weather', getWeather)
app.get('/yelp', getYelp);

// Handlers
function getLocation (req, res) {
  return searchToLatLong(req.query.data)
    .then(locationData => {
      res.send(locationData);
    });
}

function getWeather (req, res) {
  return searchForWeather(req.query.data)
    .then(weatherData => {
      res.send(weatherData);
    });
}

function getYelp(req, res) {
  return searchYelp(req.query.data)
    .then(yelpData => {
      res.send(yelpData);
    });
}

// Error handling
function handleError(res) {
  res.status(500).send('Sorry something went wrong!');
}

// Constructor functions
function Location(location, query) {
  this.search_query = query;
  this.formatted_query = location.formatted_address;
  this.latitude = location.geometry.location.lat;
  this.longitude = location.geometry.location.lng;
}

function Daily (day) {
  this.forecast = day.summary
  this.time = new Date(day.time * 1000).toDateString()
}

function Yelp(business) {
  this.name = business.name;
  this.image_url = business.image_url;
  this.price = business.price;
  this.rating = business.rating;
  this.url = business.url;
}

// Search Functions
//trying to add sql
function searchToLatLong(req, res) {
  let query = req.query.data;
  const SQL = 'SELECT * FROM locations WHERE search_query=$1';
  const values = [query];
  return client.query(SQL, values)
    .then(data => {
      if (data.rowCount){
        console.log('Location retrieved from database')
        console.log(data)
        res.status(200).send(data.rows[0]);
      } else {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${process.env.GEOCODE_API_KEY}`;
        return superagent.get(url)
          .then(result => {
            console.log('Location retrieved from google')
            const location = new Location(result.body.results[0]);
            let SQL = `INSERT INTO locations
            (search_query, formatted_query, latitude, longitude)
            VALUES($1, $2, $3, $4)`;
            return client.query(SQL, [query,location.formatted_query, location.latitude, location.longitude])
              .then(() => {

                // then send it back
                res.status(200).send(location);

              })
          })
      }
    })
    .catch(err => {
      console.error(err);
      res.send(err)
    })
}

function searchForWeather(query) {
  const url = `https://api.darksky.net/forecast/${process.env.DARKSKY_API_KEY}/${query.latitude},${query.longitude}`;
  return superagent.get(url)
    .then(weatherData => {
      return weatherData.body.daily.data.map(day => new Daily(day));
    })
    .catch(err => console.error(err));
}

function searchYelp(query) {
  const url = `https://api.yelp.com/v3/businesses/search?term=restaurants&latitude=${query.latitude}&longitude=${query.longitude}`;
  return superagent.get(url)
    .set('Authorization', `Bearer ${process.env.YELP_API_KEY}`)
    .then(yelpData => {
      return yelpData.body.businesses.map(business => new Yelp(business));
    });
}

app.get('/*', function(req, res) {
  res.status(404).send('You are in the wrong place');
});

// Listen
app.listen(PORT, () => {
  console.log(`Listening on port: ${PORT}`)}
);

app.get('/movies', getMovies);

function getMovies(req, res){
  return searchForMovies(req.query)
    .then( movieData => {
      res.send(movieData);
    });
}

function Movies(flicks){
  this.title = flicks.title;
  this.overview = flicks.overview;
  this.average_votes = flicks.vote_average;
  this.total_votes = flicks.vote_count;
  this.popularity = flicks.popularity;
  this.image_url = `https://image.tmdb.org/t/p/w185/${flicks.poster_path}`;
  this.released_on = flicks.release_date;
}

function searchForMovies(query){
  const url = (`https://api.themoviedb.org/3/search/movie?api_key=${process.env.MOVIES_DB_API_KEY}&query=${query.data.city}`);
  return superagent.get(url)
    .then(movieData => {
      let flicks = [];
      movieData.body.results.map(movies => flicks.push(new Movies(movies)));
      return flicks;
    })
    .catch(err => console.error(err));
}