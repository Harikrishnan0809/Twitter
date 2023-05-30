const express = require("express");
const app = express();
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const filePath = path.join(__dirname, "twitterClone.db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { format } = require("date-fns");
let db = null;
app.use(express.json());

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: filePath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("The server running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`Db Error :${e.message}`);
  }
};

//Authentication Middleware Function
const authenticationFunction = async (request, response, next) => {
  const authHeaders = request.headers["authorization"];
  let token;

  if (authHeaders !== undefined) {
    token = authHeaders.split(" ")[1];
  }

  if (token !== undefined) {
    jwt.verify(token, "MY_SECRET_TOKEN", (error, payload) => {
      console.log(error);
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token1");
      } else {
        request.username = payload.username;
        next();
      }
    });
  } else {
    response.status(401);
    response.send("Invalid JWT Token2");
  }
};

initializeDbAndServer();
//API :1
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const validUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const hashedPassword = await bcrypt.hash(password, 10);
  const isValidUser = await db.get(validUserQuery);

  console.log(hashedPassword);

  if (isValidUser === undefined) {
    if (password.length >= 6) {
      const postUserQuery = `
      INSERT INTO user ( name, username, password, gender)
      VALUES ('${name}', '${username}', '${hashedPassword}', '${gender}');`;
      await db.run(postUserQuery);
      response.status(200);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//API :2
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(getUserQuery);

  if (dbUser !== undefined) {
    const isValidPw = await bcrypt.compare(password, dbUser.password);
    if (isValidPw === true) {
      const payload = { username: username };

      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  } else {
    response.status(400);
    response.send("Invalid user");
  }
});

//API :3
app.get(
  "/user/tweets/feed/",
  authenticationFunction,
  async (request, response) => {
    const query = `
  SELECT user.username AS username, tweet.tweet As tweet, tweet.date_time AS dateTime 
  FROM (user 
  INNER JOIN tweet 
  ON user.user_id = tweet.user_id) AS 
  tables INNER JOIN  follower ON tables.user_id = follower.follower_user_id
  GROUP BY user.user_id
  ORDER BY tweet.date_time DESC
  LIMIT 4;`;

    const getDetails = await db.all(query);
    response.send(getDetails);
  }
);

//API :4
app.get(
  "/user/following/",
  authenticationFunction,
  async (request, response) => {
    const followersQuery = `
    SELECT user.name AS name
    FROM user INNER JOIN follower ON user.user_id = follower.following_user_id
    GROUP BY user.user_id;`;

    const getFollower = await db.all(followersQuery);
    response.send(getFollower);
  }
);

//API :5
app.get(
  "/user/followers/",
  authenticationFunction,
  async (request, response) => {
    const followersQuery = `
    SELECT user.name AS name
    FROM user INNER JOIN follower ON user.user_id = follower.follower_user_id
    GROUP BY user.user_id;`;

    const getFollower = await db.all(followersQuery);
    response.send(getFollower);
  }
);

//API :6
app.get(
  "/tweets/:tweetId/",
  authenticationFunction,
  async (request, response) => {
    const { tweetId } = request.params;
    const filterQuery = `
    SELECT tweet.tweet AS tweet, 
    COUNT(like.like_id) AS likes,
    COUNT(reply.reply_id) AS replies,
    tweet.date_time AS dateTime
    FROM ((tweet INNER JOIN follower 
    ON tweet.user_id = follower.following_user_id)
    LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id) 
    LEFT JOIN like ON tweet.tweet_id = like.tweet_id
    WHERE tweet.tweet_id = '${tweetId}'
    GROUP BY tweet.tweet_id;`;
    let details;
    details = await db.get(filterQuery);

    if (details !== undefined) {
      response.send(details);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API :7
app.get(
  "/tweets/:tweetId/likes/",
  authenticationFunction,
  async (request, response) => {
    const { tweetId } = request.params;
    const userLikedQuery = `
    SELECT DISTINCT user.name
    FROM ((tweet INNER JOIN follower
        ON tweet.user_id = following_user_id) LEFT JOIN like
        ON tweet.tweet_id = like.tweet_id) INNER JOIN user
        ON like.user_id = user.user_id
    WHERE tweet.tweet_id = '${tweetId}';`;
    let listOfNames;
    listOfNames = await db.all(userLikedQuery);
    let list = [];
    if (listOfNames.length !== 0) {
      listOfNames.map((eachItems) => {
        list.push(eachItems.name);
      });
      const answer = { likes: list };
      response.send(answer);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API :8
app.get(
  "/tweets/:tweetId/replies/",
  authenticationFunction,
  async (request, response) => {
    const { tweetId } = request.params;
    const listOfReplaysQuery = `
    SELECT user.name, reply.reply 
    FROM (reply INNER JOIN follower ON reply.user_id = follower.following_user_id) AS usersTable
    INNER JOIN user ON user.user_id = usersTable.user_id
    GROUP BY user.user_id;`;
    let detail;
    detail = await db.all(listOfReplaysQuery);
    if (detail !== undefined) {
      const answers = { replies: detail };
      response.send(answers);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API :9
app.get("/user/tweets/", authenticationFunction, async (request, response) => {
  const getListOfTweetsQuery = `
    SELECT tweet.tweet, COUNT(like.like_id) AS likes, 
    COUNT(reply.reply_id) AS replies, tweet.date_time
    FROM (tweet LEFT JOIN like ON tweet.tweet_id = like.tweet_id)
    LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id
    GROUP BY tweet.tweet_id;`;

  const getAllTweet = await db.all(getListOfTweetsQuery);
  response.send(getAllTweet);
});

//API :10
app.post("/user/tweets/", authenticationFunction, async (request, response) => {
  const { username } = request;
  const { tweet } = request.body;
  const getUserDetails = `
    SELECT * FROM user WHERE username = '${username}';`;
  const date = new Date();
  let formateDate = format(date, "yyyy-MM-dd kk:mm:ss");
  let details;
  details = await db.get(getUserDetails);
  if (details !== undefined) {
    const postQuery = `
        INSERT INTO tweet (tweet, user_id, date_time)
        VALUES ('${tweet}', '${details.user_id}', '${formateDate}');`;

    await db.run(postQuery);
    response.send("Created a Tweet");
  }
});

//API :11
app.delete(
  "/tweets/:tweetId/",
  authenticationFunction,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;

    const getUserQuery = `SELECT * FROM user INNER JOIN tweet
  ON user.user_id = tweet.user_id
  WHERE tweet.tweet_id = '${tweetId}';`;

    const getUser = await db.get(getUserQuery);
    console.log(getUser);

    const getCurrentUserQuery = `SELECT * FROM user
  WHERE username = '${username}';`;
    const getCurrentUser = await db.get(getCurrentUserQuery);
    console.log(getCurrentUser);

    if (getUser === getCurrentUser) {
      const deleteQuery = `DELETE FROM tweet
  WHERE tweet_id = '${tweetId}';`;

      await db.run(deleteQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
