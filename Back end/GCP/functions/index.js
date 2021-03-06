const functions = require("firebase-functions");

const admin = require("firebase-admin");
admin.initializeApp();
const express = require("express");
const app = express();

const cors = require("cors");
app.use(cors({
  origin: true
}));

const bcrypt = require("bcrypt");
const saltRounds = 11;
const fetch = require("node-fetch");
const formidable = require("formidable-serverless");

var FormData = require("form-data");
var fs = require("fs");

const db = admin.firestore();

app.get("/getUserDetails/:id/:password", async (req, res) => {
  try {
    console.log("input data");
    console.log(req.params.id);
    const document = db.collection("users").doc(req.params.id);
    let item = await document.get();
    if (!item.exists) {
      console.log("No such document!");
    }
    let response = item.data();
    console.log(response);
    const password = req.params.password;
    const isCompared = await bcrypt.compare(password, response.password);
    if (isCompared) {
      return res.status(200).send(response);
    }
    return res.status(200).send(false);
  } catch (error) {
    console.log(error);
    return res.status(200).send(error);
  }
});

app.get("/findUser/:email", async (req, res) => {
  const email = req.params.email;
  admin
    .auth()
    .getUserByEmail(email)
    .then(userRecord => {
      return res.status(200).send(userRecord.toJSON());
    })
    .catch(error => {
      return res.status(200).send(error);
    });
});

app.post("/createUser/", async (req, res) => {
  admin
    .auth()
    .createUser({
      email: req.body.email,
      password: req.body.password
    })
    .then(userRecord => {
      return res.status(200).send(userRecord.toJSON());
    })
    .catch(error => {
      return res.status(200).send(error);
    });
});

app.post("/postUserDetails", async (req, res) => {
  const password = req.body.password;
  const encryptedPassword = await bcrypt.hash(password, saltRounds);
  try {
    await db
      .collection("users")
      .doc("/" + req.body.id + "/")
      .create({
        URL: "",
        description: "",
        messages: [],
        id: req.body.id,
        email: req.body.email,
        password: encryptedPassword,
        name: req.body.name,
        organization: req.body.organization
      });
    return res.status(200).send(req.body.id);
  } catch (error) {
    console.log(error);
    return res.status(200).send(error);
  }
});

app.delete("/deleteUser/:id", async (req, res) => {
  admin
    .auth()
    .deleteUser(req.params.id)
    .then(userRecord => {
      return res.status(200).send("deleted");
    })
    .catch(error => {
      return res.status(200).send(error);
    });
});

app.delete("/deleteUserDetails/:id", async (req, res) => {
  try {
    const document = db.collection("users").doc(req.params.id);
    await document.delete();
    return res.status(200).send("deleted");
  } catch (error) {
    console.log(error);
    return res.status(200).send(error);
  }
});

app.post("/files", async (req, res, next) => {
  try {
    console.log("Running....");
    await db
      .collection("files")
      .doc(req.body.organization)
      .collection("meta")
      .doc(req.body.file_id)
      .create({
        user: req.body.user,
        file_name: req.body.filename,
        hash: req.body.hash
      });

    return res.status(200).send({
      file_id: req.body.file_id,
      file_name: req.body.filename,
      user: req.body.user
    });
  } catch (error) {
    console.log(error);
    return res.status(400).send(error);
  }
});

app.get("/files", async (req, res, next) => {
  try {
    console.log("Running....");

    const files = await db
      .collection("files")
      .doc(req.query.organization || req.body.organization)
      .collection("meta")
      .get();

    let filesList = [];
    files.forEach((item, i) => {
      filesList.push(item.data());
    });

    return res.status(200).send(filesList);
  } catch (error) {
    console.log(error);
    return res.status(200).send(error);
  }
});


app.get("/clusterfiles", async (req, res) => {

  try {
    const files = await db
      .collection("files")
      .doc(req.query.organization || req.body.organization)
      .collection("meta")
      .get();

    let filesNameList = [];
    const hashList = [];
    files.forEach((item, i) => {
      const fileData = item.data();
      filesNameList.push(fileData["file_name"]);
      hashList.push(JSON.parse(fileData["hash"])[0]);
    });

    const reqData = {
      instances: hashList
    }

    const response = await fetch("https://fileclustering-ednqegx5tq-uc.a.run.app/predict", {
      method: "POST",
      body: JSON.stringify(reqData),
      headers: {
        "Content-Type": "application/json"
      }
    });

    const responseObj = []
    const predictionData = await response.json();
    if (predictionData["response"] == "success") {
      filesNameList.map((file, index) => {
        const fileArray = {};
        fileArray["name"] = file;
        fileArray["group"] = predictionData["predictions"][index];
        responseObj.push(fileArray);
      });

      res.status(200).send(responseObj);
    } else {
      res.status(400).send("Error fetching prediction");
    }
  } catch (error) {
    console.log(error);
    res.status(400).send(error);
  }

});

exports.app = functions.https.onRequest(app);

exports.myFunction = functions.firestore
  .document("Messages/{docId}/{collectionId}/{msgId}")
  .onCreate(async (snap, context) => {
    const newValue = snap.data();
    console.log(context.params.collectionId);
    console.log(context.params.msgId);
    console.log(newValue);
    const dataObj = {
      fileName: context.params.collectionId + "-" + context.params.msgId,
      data: newValue
    };
    await fetch(
      "https://czuil77sqd.execute-api.us-east-1.amazonaws.com/default/uploadFilesS3", {
        method: "POST",
        body: JSON.stringify(dataObj),
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
    return "success";
  });