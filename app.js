import express from 'express';
import morgan from 'morgan';
import indexRoutes from "./routes/index.js";


const app = express();

app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use("/", indexRoutes);


export default app;