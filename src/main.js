const basePath = process.cwd();//记录当前路径
const { NETWORK } = require(`${basePath}/constants/network.js`);//包含eth、sol两个常量值
const fs = require("fs");//文件读写操作
const { exit } = require("process");
const sha1 = require(`${basePath}/node_modules/sha1`);//hash运算
const { createCanvas, loadImage } = require(`${basePath}/node_modules/canvas`);//画图、加载图片的库
const buildDir = `${basePath}/build`;//build文件生成目录
const layersDir = `${basePath}/layers`;//图层文件读取目录
const {
  format,
  baseUri,
  description,
  background,
  uniqueDnaTorrance,
  layerConfigurations,
  rarityDelimiter,
  shuffleLayerConfigurations,
  debugLogs,
  extraMetadata,
  text,
  namePrefix,
  network,
  solanaMetadata,
  gif,
} = require(`${basePath}/src/config.js`);//从config配置模块中加载export的变量
const canvas = createCanvas(format.width, format.height);//创建一个画布
const ctx = canvas.getContext("2d");//配置2d环境
ctx.imageSmoothingEnabled = format.smoothing;//图片平滑过渡函数启用
var metadataList = [];//创建记录metadata的列表
var attributesList = [];//创建记录nft特性的列表
var dnaList = new Set();//创建记录dna的集合
const DNA_DELIMITER = "-";//dna分隔符
const HashlipsGiffer = require(`${basePath}/modules/HashlipsGiffer.js`);//git生成器

let hashlipsGiffer = null;

const buildSetup = () => {
  if (fs.existsSync(buildDir)) {//清空build文件夹
    fs.rmdirSync(buildDir, { recursive: true });
  }
  fs.mkdirSync(buildDir);//创建build文件夹
  fs.mkdirSync(`${buildDir}/json`);//创建json文件夹
  fs.mkdirSync(`${buildDir}/images`);//创建images文件夹
  if (gif.export) {
    fs.mkdirSync(`${buildDir}/gifs`);//如果git启用，则生成gif图
  }
};

const getRarityWeight = (_str) => {//获取稀有度
  let nameWithoutExtension = _str.slice(0, -4);//获取.png  .jpg前面的内容
  var nameWithoutWeight = Number(//获取分隔符后面的稀有度
    nameWithoutExtension.split(rarityDelimiter).pop()
  );
  if (isNaN(nameWithoutWeight)) {
    nameWithoutWeight = 1;
  }
  return nameWithoutWeight;//返回没有权重的名字
};

const cleanDna = (_str) => {
  const withoutOptions = removeQueryStrings(_str);
  var dna = Number(withoutOptions.split(":").shift());//dna记载了图层的次序，是第几张图层
  return dna;
};

const cleanName = (_str) => {//获取图层名字
  let nameWithoutExtension = _str.slice(0, -4);
  var nameWithoutWeight = nameWithoutExtension.split(rarityDelimiter).shift();//shift方法删除列表第一个元素并返回
  return nameWithoutWeight;
};

const getElements = (path) => {//获取每个图层的图片，名字，稀有度
  return fs
    .readdirSync(path)
    .filter((item) => !/(^|\/)\.[^\/\.]/g.test(item))
    .map((i, index) => {
      if (i.includes("-")) {
        throw new Error(`layer name can not contain dashes, please fix: ${i}`);
      }
      return {
        id: index,
        name: cleanName(i),
        filename: i,
        path: `${path}${i}`,
        weight: getRarityWeight(i),
      };
    });
};

const layersSetup = (layersOrder) => {//输入图层建造顺序列表
  const layers = layersOrder.map((layerObj, index) => ({//设置这一个图层
    id: index,
    elements: getElements(`${layersDir}/${layerObj.name}/`),
    name:
      layerObj.options?.["displayName"] != undefined
        ? layerObj.options?.["displayName"]
        : layerObj.name,
    blend:
      layerObj.options?.["blend"] != undefined
        ? layerObj.options?.["blend"]
        : "source-over",
    opacity:
      layerObj.options?.["opacity"] != undefined
        ? layerObj.options?.["opacity"]
        : 1,
    bypassDNA:
      layerObj.options?.["bypassDNA"] !== undefined
        ? layerObj.options?.["bypassDNA"]
        : false,
  }));
  return layers;
};

const saveImage = (_editionCount) => {//保存图片
  fs.writeFileSync(
    `${buildDir}/images/${_editionCount}.png`,
    canvas.toBuffer("image/png")
  );
};

const genColor = () => {//产生随机颜色
  let hue = Math.floor(Math.random() * 360);
  let pastel = `hsl(${hue}, 100%, ${background.brightness})`;
  return pastel;
};

const drawBackground = () => {//画背景
  ctx.fillStyle = background.static ? background.default : genColor();
  ctx.fillRect(0, 0, format.width, format.height);
};

const addMetadata = (_dna, _edition) => {//添加metadata.json
  let dateTime = Date.now();
  let tempMetadata = {
    name: `${namePrefix} #${_edition}`,
    description: description,
    image: `${baseUri}/${_edition}.png`,
    dna: sha1(_dna),
    edition: _edition,
    date: dateTime,
    ...extraMetadata,
    attributes: attributesList,
    compiler: "HashLips Art Engine",
  };
  if (network == NETWORK.sol) {
    tempMetadata = {
      //Added metadata for solana
      name: tempMetadata.name,
      symbol: solanaMetadata.symbol,
      description: tempMetadata.description,
      //Added metadata for solana
      seller_fee_basis_points: solanaMetadata.seller_fee_basis_points,
      image: `${_edition}.png`,
      //Added metadata for solana
      external_url: solanaMetadata.external_url,
      edition: _edition,
      ...extraMetadata,
      attributes: tempMetadata.attributes,
      properties: {
        files: [
          {
            uri: `${_edition}.png`,
            type: "image/png",
          },
        ],
        category: "image",
        creators: solanaMetadata.creators,
      },
    };
  }
  metadataList.push(tempMetadata);
  attributesList = [];//清空特性列表，供下一张图使用
};

const addAttributes = (_element) => {//添加特性描述
  let selectedElement = _element.layer.selectedElement;
  attributesList.push({
    trait_type: _element.layer.name,
    value: selectedElement.name,
  });
};

const loadLayerImg = async (_layer) => {//加载此图层的图片
  try {
    return new Promise(async (resolve) => {
      const image = await loadImage(`${_layer.selectedElement.path}`);
      resolve({ layer: _layer, loadedImage: image });
    });
  } catch (error) {
    console.error("Error loading image:", error);
  }
};

const addText = (_sig, x, y, size) => {//在图片上添加描述
  ctx.fillStyle = text.color;
  ctx.font = `${text.weight} ${size}pt ${text.family}`;
  ctx.textBaseline = text.baseline;
  ctx.textAlign = text.align;
  ctx.fillText(_sig, x, y);
};

const drawElement = (_renderObject, _index, _layersLen) => {//添加图层
  ctx.globalAlpha = _renderObject.layer.opacity;
  ctx.globalCompositeOperation = _renderObject.layer.blend;
  text.only//只生成文字描述
    ? addText(
        `${_renderObject.layer.name}${text.spacer}${_renderObject.layer.selectedElement.name}`,
        text.xGap,
        text.yGap * (_index + 1),
        text.size
      )
    : ctx.drawImage(
        _renderObject.loadedImage,
        0,
        0,
        format.width,
        format.height
      );

  addAttributes(_renderObject);
};

const constructLayerToDna = (_dna = "", _layers = []) => {
  //输入的dna格式为：1:B2#5.png-0:B1#20.png-0:B1#10.png-0:B1#10.png-1:B2#10.png-0:none#1.png-0:none#1.png-0:none#1.png-0:B1#10.png
  let mappedDnaToLayers = _layers.map((layer, index) => {//item,index,输入箭头函数，对item进行操作
    let selectedElement = layer.elements.find(//在每个图层中找到选中的元素
      (e) => e.id == cleanDna(_dna.split(DNA_DELIMITER)[index])//箭头函数，e表示elements的每一个元素
    );
    return {
      name: layer.name,
      blend: layer.blend,
      opacity: layer.opacity,
      selectedElement: selectedElement,
    };
  });
  return mappedDnaToLayers;
};

/**
 * In some cases a DNA string may contain optional query parameters for options
 * such as bypassing the DNA isUnique check, this function filters out those
 * items without modifying the stored DNA.
 *
 * @param {String} _dna New DNA string
 * @returns new DNA string with any items that should be filtered, removed.
 */
const filterDNAOptions = (_dna) => {
  const dnaItems = _dna.split(DNA_DELIMITER);
  const filteredDNA = dnaItems.filter((element) => {
    const query = /(\?.*$)/;
    const querystring = query.exec(element);
    if (!querystring) {
      return true;
    }
    const options = querystring[1].split("&").reduce((r, setting) => {
      const keyPairs = setting.split("=");
      return { ...r, [keyPairs[0]]: keyPairs[1] };
    }, []);

    return options.bypassDNA;
  });

  return filteredDNA.join(DNA_DELIMITER);
};

/**
 * Cleaning function for DNA strings. When DNA strings include an option, it
 * is added to the filename with a ?setting=value query string. It needs to be
 * removed to properly access the file name before Drawing.
 *
 * @param {String} _dna The entire newDNA string
 * @returns Cleaned DNA string without querystring parameters.
 */
const removeQueryStrings = (_dna) => {//用正则表达式去掉字符串中的特殊字符
  const query = /(\?.*$)/;
  return _dna.replace(query, "");
};

const isDnaUnique = (_DnaList = new Set(), _dna = "") => {
  const _filteredDNA = filterDNAOptions(_dna);
  return !_DnaList.has(_filteredDNA);
};

const createDna = (_layers) => {//生成dna
  let randNum = [];
  _layers.forEach((layer) => {
    var totalWeight = 0;
    layer.elements.forEach((element) => {
      totalWeight += element.weight;
    });
    // number between 0 - totalWeight
    let random = Math.floor(Math.random() * totalWeight);
    for (var i = 0; i < layer.elements.length; i++) {
      // subtract the current weight from the random weight until we reach a sub zero value.
      random -= layer.elements[i].weight;
      if (random < 0) {
        return randNum.push(
          `${layer.elements[i].id}:${layer.elements[i].filename}${
            layer.bypassDNA ? "?bypassDNA=true" : ""
          }`
        );
      }
    }
  });
  return randNum.join(DNA_DELIMITER);
};

const writeMetaData = (_data) => {//存储metadata
  fs.writeFileSync(`${buildDir}/json/_metadata.json`, _data);
};

const saveMetaDataSingleFile = (_editionCount) => {//存储单个metadata
  let metadata = metadataList.find((meta) => meta.edition == _editionCount);
  debugLogs
    ? console.log(
        `Writing metadata for ${_editionCount}: ${JSON.stringify(metadata)}`
      )
    : null;
  fs.writeFileSync(
    `${buildDir}/json/${_editionCount}.json`,
    JSON.stringify(metadata, null, 2)
  );
};

function shuffle(array) {
  let currentIndex = array.length,
    randomIndex;
  while (currentIndex != 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex],
      array[currentIndex],
    ];
  }
  return array;
}

const startCreating = async () => {
  let layerConfigIndex = 0;
  let editionCount = 0;
  let failedCount = 0;
  let abstractedIndexes = [];
  for (
    let i = network == NETWORK.sol ? 0 : editionCount;
    i <= layerConfigurations[layerConfigurations.length - 1].growEditionSizeTo-1;
    i++
  ) {
    abstractedIndexes.push(i);
  }//提取所有的索引
  if (shuffleLayerConfigurations) {
    abstractedIndexes = shuffle(abstractedIndexes);
  }//随机打乱生成次序
  debugLogs
    ? console.log("Editions left to create: ", abstractedIndexes)
    : null;
  while (layerConfigIndex < layerConfigurations.length) {//遍历所有的图层组合模式
    const layers = layersSetup(
      layerConfigurations[layerConfigIndex].layersOrder//输入此组合模式图层建造顺序
    );
    while (//直到生成此组合模式里达到的数量
      editionCount+1 <= layerConfigurations[layerConfigIndex].growEditionSizeTo
    ) {
      let newDna = createDna(layers);//生成dna
      //console.log("new dna:",newDna) //生成的dna为选用的图片序列组合
      //dna格式：  1:B2#5.png-0:B1#20.png-0:B1#10.png-0:B1#10.png-1:B2#10.png-0:none#1.png-0:none#1.png-0:none#1.png-0:B1#10.png
      if (isDnaUnique(dnaList, newDna)) {
        let results = constructLayerToDna(newDna, layers);//根据dna中的被选中的元素信息，组合layer
        let loadedElements = [];

        results.forEach((layer) => {
          loadedElements.push(loadLayerImg(layer));
        });

        await Promise.all(loadedElements).then((renderObjectArray) => {
          debugLogs ? console.log("Clearing canvas") : null;
          ctx.clearRect(0, 0, format.width, format.height);
          if (gif.export) {//生成gif图
            hashlipsGiffer = new HashlipsGiffer(
              canvas,
              ctx,
              `${buildDir}/gifs/${abstractedIndexes[0]}.gif`,
              gif.repeat,
              gif.quality,
              gif.delay
            );
            hashlipsGiffer.start();
          }
          if (background.generate) {//自动生成背景
            drawBackground();
          }
          renderObjectArray.forEach((renderObject, index) => {//渲染图层
            drawElement(
              renderObject,
              index,
              layerConfigurations[layerConfigIndex].layersOrder.length//图层的总数
            );
            if (gif.export) {//生成gif图
              hashlipsGiffer.add();
            }
          });
          if (gif.export) {
            hashlipsGiffer.stop();
          }
          debugLogs
            ? console.log("Editions left to create: ", abstractedIndexes)
            : null;
          saveImage(abstractedIndexes[0]);//保存图片
          addMetadata(newDna, abstractedIndexes[0]);//添加metadata
          saveMetaDataSingleFile(abstractedIndexes[0]);//保存单个metadata
          console.log(
            `Created edition: ${abstractedIndexes[0]}, with DNA: ${sha1(
              newDna
            )}`
          );
        });
        dnaList.add(filterDNAOptions(newDna));
        editionCount++;
        abstractedIndexes.shift();
      } else {//dna已经生成
        console.log("DNA exists!");
        failedCount++;
        if (failedCount >= uniqueDnaTorrance) {//失败次数达到上限之后
          console.log(
            `You need more layers or elements to grow your edition to ${layerConfigurations[layerConfigIndex].growEditionSizeTo} artworks!`
          );
          process.exit();
        }
      }
    }
    layerConfigIndex++;
  }
  writeMetaData(JSON.stringify(metadataList, null, 2));
};

module.exports = { startCreating, buildSetup, getElements };
