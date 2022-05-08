# 切片上传文件Demo

## 安装

1. cnpm i
2. node server.js
3. 浏览器打开html文件选择文件上传

## 背景

时不时在论坛上看到相关的文章，但是一直没有自己动手去实现，所以找了个时间盘一下它，这里主要记录一下实现的过程。

## 功能

1. 切片上传
2. 限制并发
3. 上传的暂停与继续
4. 所有切片完成后自动合并

## 使用到的技术

- Axios
- Express
- express-formidable库

## 思路

1. 首先实现文件的切片，前端使用slice进行文件的分割。

```js
// 切片
function generateChunkList(file) {
    const list = []
    // 分割大小：1M，可动态调整
    const size = 1024 * 1024
    let cur = 0

    while (cur < file.size) {
        list.push({
            chunk: file.slice(cur, cur + size),
            // 记录位置
            hash: cur
        })
        cur += size
    }

    return list
}
```

2. 接着是上传，把切割后的数据通过FormData的数据格式传给服务端，这里使用的是`axios`。

```js
// 上传
function upload(data, filename, size) {
    return new Promise((resolve, reject) => {
        const {
            chunk,
            hash
        } = data

        const formData = new FormData()
        formData.append("chunk", chunk)
        formData.append("hash", hash)
        formData.append("filename", filename)
        // 服务端通过总大小来判断是否全部上传完成
        formData.append("size", size)

        axios({
            method: "POST",
            url,
            data: formData
        }).then(resolve).catch(reject)
    })
}
```

3. 如果同时上传所有切片，无疑会对客户端和服务端造成一定的压力，所以需要控制并发。这里包含一些进度的显示，以及暂停的逻辑。重点是**loop**函数的实现。

```js
/**
 * 批量上传
 * @param chunks 切片数据
 * @param filename 文件名
 * @param size 文件总大小
 * @param completeCallback 任意一个chunk上传完成时执行，参数为下一次开始的序号（记录下次继续上传时开始的序号）
 * @param startIndex 从chunks的某个序号开始上传（断点续传）
 * @param maxTaskCount 同时上传的最大任务数量
 */
function partUpload(chunks, filename, size, completeCallback, startIndex = 0, maxTaskCount = 5) {

    // 完成数量
    let completeCount = startIndex

    // 显示进度的DOM
    const progressTextDom = document.getElementById("progressText")

    // 主要逻辑：每个切片任务上传完成时，会去判断还有没有剩余的切片。
    const loop = (index) => {
        upload(chunks[index], filename, size).then(() => {

            completeCount++
            // 更新进度
            progressTextDom.innerText = Math.floor(completeCount / chunks.length * 100)
                .toString()

            // 是否已暂停
            if (isPause) {
                return;
            }

            if (completeCount === chunks.length) {
                console.log('所有chunk上传完成')
                // 隐藏按钮（暂停/继续）
                document.getElementById("btn").style.display = "none"
                return
            }

            if (startIndex < chunks.length) {
                loop(startIndex++)
                completeCallback && completeCallback(startIndex)
            }

        }).catch((err) => {
            console.log("上传失败", err)
            document.getElementById("btn").style.display = "none"
        })
    }

    // 同时开始多个任务
    for (let i = 0; i < maxTaskCount && startIndex < chunks.length; i++) {
        loop(startIndex++)
    }

}

```

4. 文件选择逻辑 & 暂停/继续

```js
// 变量共享

// 上传的文件
let file
// 文件切割后的数据
let chunks
// 文件名
let filename
// 当前上传序号
let curIndex

document.getElementById("upload").addEventListener("change", function () {
    const files = this.files
    file = files[0]

    if (!file) {
        return
    }

    // 生成切片
    chunks = generateChunkList(file)
    // 唯一的文件名
    filename = `${new Date().getTime()}_${file.name}`
    // 重置起始的上传序号
    curIndex = 0

    document.getElementById("progressText").innerText = "0"
    document.getElementById("btn").style.display = "inline-block"

    partUpload(chunks, filename, file.size, (index) => curIndex = index, curIndex, 2)

})

// 暂停/继续按钮的点击事件
document.getElementById("btn").addEventListener("click", function () {
    isPause = this.innerText === "暂停"
    this.innerText = isPause ? "继续" : "暂停"
    // 继续上传
    if (!isPause) {
        partUpload(chunks, filename, file.size, (index) => curIndex = index, curIndex, 5)
    }
})

```

5. 最后是服务端的实现，我使用的是`express`框架，配合`express-formidable`来解析`FormData`格式的数据。这里的重点是使用buffer来对传入的文件数据进行组合，同时用一个对象来存储已上传的buffer。

```js
// 存储buffer
const uploadFiles = {};

app.post("/", (req, res) => {
  // 都为字符串类型
  const { filename, hash, size } = req.fields;

  if (!uploadFiles[filename]) {
    uploadFiles[filename] = {
      // 生成对应大小的buffer
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

  // 全部切片都上传完成
  if (uploadFiles[filename].total === parseInt(size)) {
    // 写入文件
    fs.writeFileSync(filename, uploadFiles[filename].data, {
      encoding: null,
    });
    uploadFiles[filename] = null
  }

  res.end("ok");
});
```

## 最后

大多数的做法是需要在切片上传完成后再发送一条合并请求，我是在服务端通过计算所有切片大小的总和来判断所有切片是否全部上传完成，当出现上传失败的情况时会存在问题。如果需要考虑这种情况的话，还是需要通过合并请求来组合最终的文件。