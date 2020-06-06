const child_process = require("child_process");
const SOLA_FILE_PATH = `"/media/da3dsoul/Golias/Media/Video/TV Shows/Animated/Anime"`;
const exts = [ 
    "MKV",
    "AVI",
    "MP4",
    "MOV",
    "OGM",
    "WMV",
    "MPG",
    "MPEG",
    "MK3D",
    "M4V"
  ];
console.log(`Scanning ${SOLA_FILE_PATH}`);
const concurrency = 50;
let extentions = `-iname "*.`;
for (let i = 0; i < exts.length; i++) {
    const element = exts[i];
    if (i == 0)
    {
        extentions += element + `"`;
    } else
    {
        extentions += ` -o -iname "*.${element}"`;
    }
}
const args = process.argv[2] ? `-mmin -${process.argv[2]}` : "";
const fileList = child_process
.execSync(`find -L ${SOLA_FILE_PATH} -type f \\( ${extentions} \\) ${args}`, {
    maxBuffer: 1024 * 1024 * 100,
})
.toString()
.split("\n")
.filter((each) => each);
console.log(`Found ${fileList.length} files, updating database...`);
const unquotedFilePath = SOLA_FILE_PATH.replace(/"/g, ``);
const newList = fileList
    .map((filePath) => filePath.replace(unquotedFilePath, ""));
console.log(newList);
