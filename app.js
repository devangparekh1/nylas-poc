import { createRequire } from "module";
import { commandOptions, createClient } from "redis";
import Draft from "nylas/lib/models/draft.js";
import File from "nylas/lib/models/file.js";
import fs from "fs";

const require = createRequire(import.meta.url);

const Nylas = require("nylas");
const express = require("express");
const { default: Event } = require("nylas/lib/models/event");
const { Label } = require("nylas/lib/models/folder");

const upload = require("express-fileupload");

require("dotenv").config();

const app = express();

app.use(express.json());

app.use(upload());

const client = createClient({
  socket: {
    host: "127.0.0.1",
    port: 6379,
  },
});

client.connect();

Nylas.config({
  clientId: process.env.NYLAS_CLIENT_ID,
  clientSecret: process.env.NYLAS_CLIENT_SECRET,
});

app.get("/connect", (req, res, next) => {
  const options = {
    redirectURI: "http://localhost:3000/oauth/callback",
    scopes: ["email", "calendar", "contacts"],
  };
  res.redirect(Nylas.urlForAuthentication(options));
});

app.get("/oauth/callback", (req, res, next) => {
  console.log("Callback occured");

  if (req.query.code) {
    Nylas.exchangeCodeForToken(req.query.code).then(async (token) => {
      await client.set(token.emailAddress, token.accessToken);
    });
    res.status(200).json({ message: "Success" });
  } else if (req.query.error) {
    res.render("error", {
      message: req.query.reason,
      error: {
        status:
          "Please try authenticating again or use a different email account.",
        stack: "",
      },
    });
  }
});

app.get("/subjects", async (req, res, next) => {
  const token = await client.get(req.query.emailAddress);
  const nylas = Nylas.with(token);
  const messages = await nylas.threads.list({ limit: 100 });
  const subjects = await messages.map((message) => message.subject);
  res.status(200).json({ subjects: subjects });
});

app.get("/emails", async (req, res, next) => {
  const token = await client.get(req.query.emailAddress);
  const nylas = Nylas.with(token);
  const messages = await nylas.threads.list({ limit: 100 });
  return res.status(200).json({ messages: messages });
});

app.post("/send-email", async (req, res, next) => {
  console.log();

  const token = await client.get(req.query.emailAddress);
  const nylas = Nylas.with(token);

  const file = new File.default(nylas, {
    data: req.files.file.data,
    contentType: req.files.file.mimetype,
    filename: req.files.file.name,
  });

  const uploadedFile = await file.upload();

  const draft = new Draft.default(nylas, {
    subject: "Pacific Crest Healthcare",
    body: "Testing the sending with CC and BCC and attachments",
    to: [{ name: "Bhavik Manek", email: "bhavik.manek@marutitech.com" }],
    cc: [{ name: "Madhuri Jain", email: "madhuri.jain@marutitech.com" }],
    bcc: [{ name: "Darshika Sharma", email: "darshika.sharma@marutitech.com" }],
    files: [uploadedFile],
  });

  // Send the email
  try {
    await draft.send();
    return res.status(200).json({ message: "Success" });
  } catch (err) {
    return res.status(500).json({ message: "Error" });
  }
});

app.post("/save-draft", async (req, res, next) => {
  const token = await client.get(req.query.emailAddress);
  const nylas = Nylas.with(token);
  const draft = new Draft.default(nylas, {
    subject: "With Love, from PCH",
    body: "Hey there, I am saving this email draft using Nylas.",
    to: [{ name: "Fredie Mercury", email: "fredie.mercury@queen.com" }],
  });
  // Saving the draft
  try {
    await draft.save();
    return res.status(200).json({ message: "Success" });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ message: "Error" });
  }
});

app.get("/labels", async (req, res, next) => {
  const token = await client.get(req.query.emailAddress);
  const nylas = Nylas.with(token);
  const labels = await nylas.labels.list();
  return res.status(200).json({ labels: labels });
});

app.post("/label", async (req, res, next) => {
  const token = await client.get(req.query.emailAddress);
  const nylas = Nylas.with(token);

  const label = new Label(nylas);

  //Setting up the label name.
  label.displayName = req.body.name;

  try {
    await label.save();
    return res.status(200).json({ message: "Success" });
  } catch (err) {
    return res.status(500).json({ message: `Error: ${err.message}` });
  }
});

app.post("/assign-label", async (req, res, next) => {
  const token = await client.get(req.query.emailAddress);
  const nylas = Nylas.with(token);

  const labels_list = await nylas.labels.list();

  const label = labels_list.find(
    (label) => label.displayName === req.body.label
  );

  const thread = await nylas.threads.find(req.body.threadId);

  thread.labels.push(label);

  try {
    await thread.save();
    return res.status(200).json({ message: "Success" });
  } catch (err) {
    return res.status(500).json({ message: `Error: ${err.message}` });
  }
});

app.delete("/delete-label", async (req, res, next) => {
  const token = await client.get(req.query.emailAddress);
  const nylas = Nylas.with(token);

  const labels_list = await nylas.labels.list();
  const label = labels_list.find(
    (label) => label.displayName === req.body.label
  );

  try {
    await nylas.labels.delete(label.id);

    return res.status(200).json({ message: "Success" });
  } catch (err) {
    return res.status(500).json({ message: `Error: ${err.message}` });
  }
});

app.get("/calendars", async (req, res, next) => {
  const token = await client.get(req.query.emailAddress);
  const nylas = Nylas.with(token);
  const calendars = await nylas.calendars.list();
  return res.status(200).json({ calendars: calendars });
});

app.post("/create-event", async (req, res, next) => {
  const token = await client.get(req.query.emailAddress);
  const nylas = Nylas.with(token);
  const event = new Event(nylas, {
    title: "Nylas Node.js Event",
    location: "My House!",
    when: { startTime: 1661852700, endTime: 1661853000 },
    participants: [
      { email: "harsh.makadia@marutitech.com", name: "Harsh" },
      { email: "devangparekh2014@gmail.com", name: "Devang" },
      { email: "hamir.nandaniya@marutitech.com", name: "Hamir" },
    ],
    calendarId: "9wc6b8xz761rda78io5vw91u4",
  });

  try {
    await event.save({ notify_participants: true });
    return res.status(200).json({ message: "Success" });
  } catch (err) {
    console.log("Error", err);
    return res.status(500).json({ message: "Error" });
  }
});

//Mails By category
app.get("/sent-mails", async (req, res, next) => {
  const token = await client.get(req.query.emailAddress);
  const nylas = Nylas.with(token);
  const messages = await nylas.messages.list({
    in: "sent" /* Paste the categories here like spam, important, input */,
  });
  return res.status(200).json({ messages: messages });
});

app.get("/trash-mail", async (req, res, next) => {
  const token = await client.get(req.query.emailAddress);
  const nylas = Nylas.with(token);

  const labels = await nylas.labels.list();

  const thread = await nylas.threads.find(req.query.threadId);

  // Moving to trash

  const trash_label = labels.find((label) => label.name === "trash");
  await thread.labels.push(trash_label);

  try {
    await thread.save();
    return res.status(200).json({ message: "Success" });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ message: "Error" });
  }
});

app.get("/trash-messages", async (req, res, next) => {
  const token = await client.get(req.query.emailAddress);
  const nylas = Nylas.with(token);

  const labels = await nylas.labels.list();

  const message = await nylas.messages.find(req.query.messageId);

  // Moving to trash
  const trash_label = labels.find((label) => label.name === "trash");
  await message.labels.push(trash_label);

  try {
    await message.save();
    return res.status(200).json({ message: "Success" });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ message: "Error" });
  }
});

app.get("/spam-mail", async (req, res, next) => {
  const token = await client.get(req.query.emailAddress);
  const nylas = Nylas.with(token);

  const labels = await nylas.labels.list();
  const thread = await nylas.threads.find(req.query.threadId);

  // Moving to spam
  const trash_label = labels.find((label) => label.name === "spam");
  await thread.labels.push(trash_label);

  try {
    await thread.save();
    return res.status(200).json({ message: "Success" });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ message: "Error" });
  }
});

app.post("/reply-to-email", async (req, res, next) => {
  const token = await client.get(req.query.emailAddress);
  const nylas = Nylas.with(token);
  const thread = await nylas.threads.find("2278auirowv6k9j75avbrmit6");
  await thread.participants.push({
    name: "Devang Parekh",
    email: "devangparekh2014@gmail.com",
  });

  const draft = new Draft.default(nylas, {
    subject: "I will find this thing",
    body: "Hey there, I am saving this email draft using Nylas.",
    to: [{ name: "Bhavik Manek", email: "bhavik.manek@marutitech.com" }],
    replyTo: [{ name: "Bhavik Manek", email: "bhavik.manek@marutitech.com" }],
    replyToMessageId: "3qo39l5hmnhcr0qao5fm98uo0",
  });

  try {
    await thread.save();
    return res.status(200).json({ message: "Success" });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ message: "Error" });
  }
});

app.post("/forward-email", async (req, res, next) => {
  const token = await client.get(req.query.emailAddress);
  const nylas = Nylas.with(token);
  const thread = await nylas.threads.find("2278auirowv6k9j75avbrmit6");
  const draft_builder = nylas.drafts.build({
    threadId: "6k7x69uj38ehi49d0s1shpuc7",
  });
  try {
    await draft_builder.save();

    return res.status(200).json({ message: "Success" });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ message: "Error" });
  }
});

// Forward email to multiple people'
app.post("/forward-email-to-multiple", async (req, res, next) => {
  const token = await client.get(req.query.emailAddress);
  const nylas = Nylas.with(token);
  const thread = await nylas.threads.find(req.query.threadId);
  const draft_builder = nylas.drafts.build({
    threadId: "6k7x69uj38ehi49d0s1shpuc7",
    subject: "I will find this thing",
    to: [{ name: "Bhavik Manek", email: "bhavik.manek@marutitech.com" }],
    cc: [{ name: "Devang Parekh", email: "devangparekh2014@gmail.com" }],
  });
  try {
    await draft_builder.send();

    return res.status(200).json({ message: "Success" });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ message: "Error" });
  }
});

// // Revoke access token
app.get("/revoke-access-token", async (req, res, next) => {
//   const token = await client.get(req.query.emailAddress);
//   const nylas = Nylas.with(token);
  try {
    const account = await Nylas.accounts.find(req.query.accountId);
    // await account.revokeAll('kept_access_token');
    await account.revokeAll();
    return res.status(200).json({ message: "Success" });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ message: "Error" });
  }
});

// Return account details
app.get("/account-details", async (req, res, next) => {
  const token = await client.get(req.query.emailAddress);
  const nylas = Nylas.with(token);
  try {
    const account = await nylas.account.get();
    return res.status(200).json({ account });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ message: "Error" });
  }
});

app.get("/webhook", (req, res) => {
  res.status(200).send(req.query.challenge);
});

app.post("/webhook", (req, res) => {
  console.log(req.body.deltas[0].object_data);
  //Create a socket event using the account id and push the event into the socket
  return res.status(200).send();
});

app.listen(3000, () => {
  console.log("Server started on port 3000");
});
