const express = require('express');
const mysql = require('mysql');
const bodyParser = require('body-parser');
const request = require('request');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const sess = require('express-session');
const BetterMemoryStore = require('session-memory-store')(sess);

const app = express();

app.use(express.static('public')); // staattisten tiedostojen jakelu public-kansiosta
app.set('view engine', 'ejs'); // käyttöliittymän ejs-tiedostot
app.use(bodyParser.urlencoded({ extended: true }));

// LUODAAN SESSIO KIRJAUTUMISTA VARTEN //
const store = new BetterMemoryStore({ expires: 60 * 60 * 1000, debug: true });

app.use(sess({
   name: 'MOVIESESSION',
   secret: 'SECRETOFMOVIES',
   store:  store,
   resave: true,
   saveUninitialized: true
}));

app.use(passport.initialize());
app.use(passport.session());

passport.use('local', new LocalStrategy({
  usernameField: 'username',
  passwordField: 'password',
  passReqToCallback: true
} , function (req, username, password, done){
      if(!username || !password ) { 
        return done(null, false);
      }
      const connection = mysql.createConnection({
        host: "localhost",
        user: "root",
        password: "salasana",
        database: "mymovies"
      });
      connection.query("select * from users where username = ?", [username], function(err, rows){
        if (err) return done();

        if(!rows.length){ 
          return done(null, false); 
        }

        var dbPassword  = rows[0].password;
        if(!(dbPassword == password)){
          return done(null, false);
        }

        req.session.user = rows[0];
        return done(null, rows[0]);
      });
    }
));

passport.serializeUser(function(user, done){
  done(null, user.id);
});

passport.deserializeUser(function(id, done){
  const connection = mysql.createConnection({
      host: "localhost",
      user: "root",
      password: "salasana",
      database: "mymovies"
    });

    connection.query("select * from users where id = "+ id, function (err, rows){
        done(err, rows[0]);
    });
});

// OHJAUS LOGIN-SIVULLE JOS SISÄLTÖ KIRJAUTUMISEN TKANA //
function isAuthenticated(req, res, next) {
  if (req.isAuthenticated())
    return next();
  res.redirect('/login');
}

// GETIT JA POSTIT //

// kirjautuminen //
app.get('/login', function(req, res){
  res.render('login');
});

app.post("/login", passport.authenticate('local', {
  successRedirect: '/myMovies',
  failureRedirect: '/login',
}), function(req, res){
  res.render('login');
});

// kirjautuminen ulos //
app.get('/logout', function(req, res){
  req.logout();
  res.redirect('/');
});

// etusivu, tämä näkyy kaikille //
app.get('/', function (req, res) {
  // elokuvien haku tietokannasta
  let query = 'SELECT * FROM movies ORDER BY id ASC';

  const connection = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "salasana",
    database: "mymovies"
  });
  connection.query(query, (err, result) => {
    if (err) {
        res.redirect('/');
    }
    else {
      res.render('allmovies.ejs', {
        movies: result
      })
    }
  })
});

// käyttäjän etusivu //
app.get('/myMovies', isAuthenticated, function (req, res) {
  let username = req.session.user.username;

  // elokuvien haku tietokannasta
  let query = 'SELECT * FROM movies ORDER BY id ASC';

  const connection = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "salasana",
    database: "mymovies"
  });
  connection.query(query, (err, result) => {
    if (err) {
        res.redirect('/');
    }
    else {
      res.render('myMovies', {
        movies: result,
        username: username
      })
    }
  })
});

// elokuvien hakeminen //
app.get('/search', isAuthenticated, function (req, res) {
  let username = req.session.user.username;
  res.render('search', {movie: null, error: null, username: username});
});

app.post('/search', function (req, res) {
  // elokuvat omdb-apista
  let apiKey = 'fc2b0bcb';
  let movie = req.body.movie;
  let url = `http://www.omdbapi.com/?apikey=${apiKey}&t=${movie}`;

  request(url, function (err, response, body) {
    if(err){
      res.render('search', {movie: null, error: 'Error, please try again'});
    } else {
      let movie = JSON.parse(body)
      if(movie.Title == undefined){
        res.render('search', {movie: null, error: 'Elokuvaa ei löytynyt'});
      } else {
        // tiedot sivua varten
        let movieTitle = `${movie.Title}`;
        let movieYear = `${movie.Year}`;
        let moviePoster = `${movie.Poster}`;
        let movieRated = `${movie.Rated}`;
        let movieRuntime = `${movie.Runtime}`;
        let movieGenre = `${movie.Genre}`;
        let movieDirector = `${movie.Director}`;
        let movieWriter = `${movie.Writer}`;
        let movieActors = `${movie.Actors}`;
        let moviePlot = `${movie.Plot}`;
        let movieLanguage = `${movie.Language}`;
        let movieCountry = `${movie.Country}`;
        let username = req.session.user.username;
        res.render('moviePage', {
          movie: movieTitle,
          year: movieYear,
          poster: moviePoster,
          rated: movieRated,
          runtime: movieRuntime,
          genre: movieGenre,
          director: movieDirector,
          writer: movieWriter,
          actors: movieActors,
          plot: moviePlot,
          language: movieLanguage,
          country: movieCountry,
          error: null,
          username: username
        });
      }
    }
  });
});

// elokuva-arvostelun lisääminen tietokantaan
app.post('/dbmovies', function (req, res) {
  // mitä kenttiin kirjoitettiin (req.body..)
  let title = req.body.title;
  let review = req.body.review;
  let username = req.session.user.username;

  const connection = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "salasana",
    database: "mymovies"
  });
  connection.connect(function(err) {
    if (err) throw err;
    console.log("Connected!");
    var sql = "INSERT INTO movies (title, review, username) VALUES ('"+title+"', '"+review+"', '"+username+"')";
    connection.query(sql, function (err, result) {
      if (err) throw err;
      console.log(result);
    });
  });
  // timeout, koska muuten elokuva ei ehdi mennä perille kantaan ennen redirectia
  setTimeout(function() {
    return res.redirect('mymovies');
  }, 1000);
})

// omat arvostelut -näkymä
app.get('/myreviews', isAuthenticated, function (req, res) {
  let username = req.session.user.username;
  // hae tietokannasta arvostelut, joissa kirjautunut username
  let query = 'SELECT * FROM movies WHERE username = "' + username + '" ORDER BY id ASC';

  const connection = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "salasana",
    database: "mymovies"
  });
  connection.query(query, (err, result) => {
      if (err) {
          res.redirect('/');
      }
      else {
        res.render('myreviews.ejs', {
          movies: result
        })
      }
  })
});

// poista oma arvostelu
app.post('/delete', function (req, res) {
  let movieId = req.body.delete;
  let deleteMovieQuery = 'DELETE FROM movies WHERE id = "' + movieId + '"';

  const connection = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "salasana",
    database: "mymovies"
  });
  connection.query(deleteMovieQuery, (err, result) => {
      if (err) {
          return res.status(500).send(err);
      }
      res.redirect('/myreviews');
  });
});

// rekisteröitymissivu
app.get('/register', function(req, res){
  res.render('register');
});

// lisää käyttäjä tietokantaan
app.post('/dbusers', function (req, res) {
  let firstname = req.body.firstname;
  let lastname = req.body.lastname;
  let username = req.body.username;
  let password = req.body.password;

  const connection = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "salasana",
    database: "mymovies"
  });
  connection.connect(function(err) {
    if (err) throw err;
    console.log("Connected!");
    var sql = "INSERT INTO users (firstname, lastname, username, password) VALUES ('"+firstname+"', '"+lastname+"', '"+username+"', '"+password+"')";
    connection.query(sql, function (err, result) {
      if (err) throw err;
      console.log(result);
    });
  });
  setTimeout(function() {
    return res.redirect('mymovies');
  }, 1000);
});

app.listen(8080);
