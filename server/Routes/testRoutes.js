import express from "express";
import {Router} from "express";
import {working} from "../Controllers/testControllers.js"

const testRouter = Router();

testRouter.get('/',working);

export default testRouter;