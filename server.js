const express = require("express");
const formidable = require("express-formidable");
const fs = require("fs");

const app = express();

// 存储buffer
const uploadFiles = {};

app.use(formidable());

app.all("*", (_, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "X-Requested-With");
  res.header("Access-Control-Allow-Methods", "PUT,POST,GET,DELETE,OPTIONS");
  res.header("Content-Type", "application/json;charset=utf-8");
  next();
});

app.get("/", (req, res) => {
  res.end("success");
});

app.post("/", (req, res) => {
  // 都为字符串类型
  const { filename, hash, size } = req.fields;

  if (!uploadFiles[filename]) {
    uploadFiles[filename] = {
      data: Buffer.alloc(parseInt(size)),
      // 计数，标记上传是否完成
      total: 0,
    };
  }

  // buffer
  const data = fs.readFileSync(req.files.chunk.path);
  // 将请求传入的buffer复制到data对应区域
  data.copy(uploadFiles[filename].data, parseInt(hash), 0);
  uploadFiles[filename].total += data.length;

  if (uploadFiles[filename].total === parseInt(size)) {
    fs.writeFileSync(filename, uploadFiles[filename].data, {
      encoding: null,
    });
    uploadFiles[filename] = null
  }

  res.end("ok");
});

app.listen(8080, () => {
  console.log("服务已运行");
});
