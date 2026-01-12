import { db } from "../firebase.js";

const getAllUsers = async (req, res) => {
  const querySnapshot = await db.collection("users").get();
  const users = querySnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
  console.log(users);
  res.send();
};


export { getAllUsers};
