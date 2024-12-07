import { Command } from 'commander';
import * as fs from 'fs';
import * as d3 from "d3";
import { JSDOM } from 'jsdom';
import * as topojson from "topojson-client";
import { exit } from 'process';
import { Resvg } from '@resvg/resvg-js';

const program = new Command();

program
    .option('-apikey, --apikey <apikey>', 'CWA API KEY')
    .option('-p, --preferences <path>', 'Path to preferences JSON file', 'preferences.json')
    .option('-n, --number <number>', 'Earthquake number to generate / "ALL" to generate all', 'ALL');

program.parse();

const options = program.opts();


// FUNCTIONS PART

const defaultPreferences = {
    "version": "1.0.0",
    "notes": {
        "color": "#aaaaaa",
        "text": [
            "Powered by iku55/CWA-EQImage-Generator",
            "台湾の震度階級は日本の震度階級とは異なります",
            "Open Government Data License: https://data.gov.tw/license"
        ]
    },
    "points": {
        "type": "POINTS",
        "fillColors": {
            "7級": "#b40068",
            "6強": "#a50021",
            "6弱": "#ff2800",
            "5強": "#ff9900",
            "5弱": "#ffe600",
            "4級": "#fae696",
            "3級": "#0041ff",
            "2級": "#00aaff",
            "1級": "#f2f2ff"
        },
        "strokeColors": {
            "7級": "#81004a",
            "6強": "#720016",
            "6弱": "#cc2000",
            "5強": "#cc7a00",
            "5弱": "#ccb800",
            "4級": "#c6b777",
            "3級": "#0033cc",
            "2級": "#0087cc",
            "1級": "#c1c1cc"
        },
        "foreColors": {
            "7級": "#ffffff",
            "6強": "#ffffff",
            "6弱": "#ffffff",
            "5強": "#ffffff",
            "5弱": "#ffffff",
            "4級": "#000000",
            "3級": "#ffffff",
            "2級": "#ffffff",
            "1級": "#000000"
        },
        "texts": {
            "7級": "7",
            "6強": "6+",
            "6弱": "6-",
            "5強": "5+",
            "5弱": "5-",
            "4級": "4",
            "3級": "3",
            "2級": "2",
            "1級": "1"
        }
    },
    "map": {
        "topojsonData": "./taiwan.topojson",
        "centroidsData": "./taiwan_centroids.geojson",
        "fillColor": "#333333",
        "strokeColor": "#666666",
        "backgroundColor": "#222222"
    },
    "image": {
        "width": 1920
    },
    "title": "顕著な地震についての情報",
    "color": "#ffffff",
    "font": "\"Noto Sans JP\", serif",
    "fontFiles": [
        "./NotoSansJP-Bold.ttf",
        "./NotoSansJP-Regular.ttf"
    ],
    "fetch": {
        "request_uri": "https://opendata.cwa.gov.tw/api/v1/rest/datastore/E-A0015-001"
    },
    "output": {
        "file": "./out/%.png"
    }
}

async function loadPreferences(path) {
    if (!fs.existsSync(path)) {
        if (path == 'preferences.json') {
            fs.writeFileSync(path, JSON.stringify(defaultPreferences));
            return defaultPreferences;
        }
        throw Error('Cannot find preferences file ('+path+').')
    }
    return JSON.parse(fs.readFileSync(path));
}

async function fetchEarthquakes(apikey, url) {
    const request = await fetch(url+'?Authorization='+apikey);
    if (request.status == 401) {
        throw Error('Failed to request (Unauthorized). Check the API key.')
    }
    if (!request.ok) {
        throw Error('Failed to request');
    }
    const earthquakes = await request.json();
    if (!earthquakes.success) {
        throw Error('Failed to request');
    }
    return earthquakes;
}

async function generateSvg(earthquake, preferences) {
    const fillColors = preferences.points.fillColors;
    const strokeColors = preferences.points.strokeColors;
    const intensityTexts = preferences.points.texts;
    const intensityNumbers = {
        '7級': 9,
        "6強": 8,
        "6弱": 7,
        "5強": 6,
        "5弱": 5,
        "4級": 4,
        "3級": 3,
        "2級": 2,
        "1級": 1
    }
    
    var areas = {};
    
    for (const area of earthquake.Intensity.ShakingArea) {
        if (area.AreaDesc.includes('最大震度')) {
            continue;
        }
        areas[area.CountyName] = area.AreaIntensity;
    }
    
    const document = new JSDOM().window.document
    const svg = d3.select(document.body).append('svg')
    
    const width = 1920;
    const height = 1080;
    
    svg.attr('width', width);
    svg.attr('height', height);
    svg.attr('xmlns', 'http://www.w3.org/2000/svg');
    svg.attr('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    
    svg.append('rect')
        .attr('x', 0)
        .attr('y', 0)
        .attr('width', width)
        .attr('height', height)
        .style('fill', preferences.map.backgroundColor);
    
    var projection = d3.geoMercator()
        .scale(13000)
        .center([122, 23.5])
        .translate([width / 2, height / 2]);
    
    var path = d3.geoPath()
        .projection(projection);
    
    svg.selectAll('path')
        .data(taiwanGeoJson.features)
        .enter()
        .append('path')
        .attr('d', path)
        .style('fill', preferences.map.fillColor)
        .style("stroke", preferences.map.strokeColor)
        .style("stroke-width", "1.5px");
    
    if (preferences.points.type == 'AREA') {
        for (var feature of taiwanCentroids) {
            if (!areas[feature.properties.COUNTYNAME]) {
                continue;
            }
            svg.append('rect')
                .attr('x', projection(feature.geometry.coordinates)[0]-15)
                .attr('y', projection(feature.geometry.coordinates)[1]-15)
                .attr('width', '30')
                .attr('height', '30')
                .attr('fill', fillColors[areas[feature.properties.COUNTYNAME]])
                .attr('stroke', strokeColors[areas[feature.properties.COUNTYNAME]])
                .attr('stroke-width', '4px');
            svg.append('text')
                .attr('x', projection(feature.geometry.coordinates)[0])
                .attr('y', projection(feature.geometry.coordinates)[1])
                .attr("text-anchor","middle")
                .attr('dominant-baseline', 'central')
                .attr('fill', preferences.points.foreColors[areas[feature.properties.COUNTYNAME]])
                .attr('font-family', preferences.font)
                .attr('font-size', '22px')
                .text(intensityTexts[areas[feature.properties.COUNTYNAME]]);
        }
    }
    
    if (preferences.points.type == 'POINTS') {
        for (const area of earthquake.Intensity.ShakingArea) {
            for (const station of area.EqStation) {
                svg.append('rect')
                .attr('x', projection([station.StationLongitude, station.StationLatitude])[0]-5)
                .attr('y', projection([station.StationLongitude, station.StationLatitude])[1]-5)
                .attr('width', '10')
                .attr('height', '10')
                .attr('fill', fillColors[station.SeismicIntensity])
                .attr('stroke', strokeColors[station.SeismicIntensity])
                .attr('stroke-width', '4px');
            }
        }
    }
    
    svg.append("defs")
        .append("path")
        .attr("id", "Center")
        .attr("x", 0)
        .attr("y", 0)
        .attr("d", "M-20-14-6 0-20 14-14 20 0 6 14 20 20 14 6 0 20-14 14-20 0-6-14-20-20-14Z")
        .attr("fill", "#990000")
        .attr('stroke', '#fff')
        .attr('stroke-width', '3');
    
    svg.append("use")
        .attr("x", projection([earthquake.EarthquakeInfo.Epicenter.EpicenterLongitude, earthquake.EarthquakeInfo.Epicenter.EpicenterLatitude])[0])
        .attr("y", projection([earthquake.EarthquakeInfo.Epicenter.EpicenterLongitude, earthquake.EarthquakeInfo.Epicenter.EpicenterLatitude])[1])
        .attr("xlink:href", "#Center")
    
    
    svg.append('text')
        .attr('x', 1100)
        .attr('y', 100)
        .attr('fill', preferences.color)
        .text(preferences.title)
        .attr('font-family', preferences.font)
        .attr('font-size', '45px')
        .attr('font-weight', 'bold');
    svg.append('text')
        .attr('x', 1100)
        .attr('y', 150)
        .attr('fill', preferences.color)
        .text('#'+earthquake.EarthquakeNo + ' - ' + earthquake.EarthquakeInfo.OriginTime + ' M' + earthquake.EarthquakeInfo.EarthquakeMagnitude.MagnitudeValue)
        .attr('font-family', preferences.font)
        .attr('font-size', '30px');
    
    var entries = Object.entries(areas);
    entries.sort((a, b) => {return intensityNumbers[b[1]] - intensityNumbers[a[1]]});
    
    svg.append('text')
        .attr('x', 1100)
        .attr('y', 220)
        .attr('fill', preferences.color)
        .text('《観測された震度》')
        .attr('font-family', preferences.font)
        .attr('font-size', '30px');
    svg.append('text')
        .attr('x', 1100)
        .attr('y', 260)
        .attr('fill', preferences.color)
        .text('最大震度 '+entries[0][1])
        .attr('font-family', preferences.font)
        .attr('font-size', '30px');
    
    var x = 1100;
    var y = 300;
    for (const entry of entries) {
        var name = entry[0];
        name = name.replace('宜蘭縣', '宜蘭縣 （ぎらんけん）');
        name = name.replace('花蓮縣', '花蓮縣 （かれんけん）');
        name = name.replace('臺東縣', '臺東縣 （たいとうけん）');
        name = name.replace('澎湖縣', '澎湖縣 （ほうこけん）');
        name = name.replace('金門縣', '金門縣 （きんもんけん）');
        name = name.replace('連江縣', '連江縣 （れんこうけん）');
        name = name.replace('臺北市', '臺北市 （たいぺいし）');
        name = name.replace('新北市', '新北市 （しんほくし）');
        name = name.replace('桃園市', '桃園市 （とうえんし）');
        name = name.replace('臺中市', '臺中市 （たいちゅうし）');
        name = name.replace('臺南市', '臺南市 （たいなんし）');
        name = name.replace('高雄市', '高雄市 （たかおし）');
        name = name.replace('基隆市', '基隆市 （きりゅうし）');
        name = name.replace('新竹縣', '新竹縣 （しんちくけん）');
        name = name.replace('新竹市', '新竹市 （しんちくし）');
        name = name.replace('苗栗縣', '苗栗縣 （びょうりつけん）');
        name = name.replace('彰化縣', '彰化縣 （しょうかけん）');
        name = name.replace('南投縣', '南投縣 （なんとうけん）');
        name = name.replace('雲林縣', '雲林縣 （うんりんけん）');
        name = name.replace('嘉義縣', '嘉義縣 （かぎけん）');
        name = name.replace('嘉義市', '嘉義市 （かぎし）');
        name = name.replace('屏東縣', '屏東縣 （へいとうけん）');
    
        svg.append('text')
            .attr('x', x+50)
            .attr('y', y)
            .attr('fill', preferences.color)
            .text(name)
            .attr('font-family', preferences.font)
            .attr('font-size', '25px');
        svg.append('rect')
            .attr('x', x)
            .attr('y', y-25)
            .attr('width', '30')
            .attr('height', '30')
            .attr('fill', fillColors[entry[1]])
            .attr('stroke', strokeColors[entry[1]])
            .attr('stroke-width', '4px');
        svg.append('text')
            .attr('x', x+15)
            .attr('y', y-10)
            .attr("text-anchor","middle")
            .attr('dominant-baseline', 'central')
            .attr('fill', preferences.points.foreColors[entry[1]])
            .attr('font-family', preferences.font)
            .attr('font-size', '22px')
            .text(intensityTexts[entry[1]]);
        y += 50;
        if (y === 950) {
            x = 1500;
            y = 300;
        }
    }

    svg.append('text')
        .attr('x', 0)
        .attr('y', 1010)
        .attr('fill', preferences.notes.color)
        .text(preferences.notes.text[0])
        .attr('font-family', preferences.font)
        .attr('font-size', '25px');
    svg.append('text')
        .attr('x', 0)
        .attr('y', 1040)
        .attr('fill', preferences.notes.color)
        .text(preferences.notes.text[1])
        .attr('font-family', preferences.font)
        .attr('font-size', '25px');
    svg.append('text')
        .attr('x', 0)
        .attr('y', 1070)
        .attr('fill', preferences.notes.color)
        .text(preferences.notes.text[2])
        .attr('font', preferences.font)
        .attr('font-size', '25px');
    
    var buffer = await toPng(document.body.innerHTML, preferences);

    return buffer;
}

function toPng(svg, preferences) {
    return new Promise((resolve, reject) => {
        const resvg = new Resvg(svg, {
            background: preferences.map.backgroundColor,
            fitTo: {
                mode: 'width',
                value: preferences.image.width,
            },
            font: {
                fontFiles: preferences.fontFiles,
                loadSystemFonts: false,
                defaultFontFamily: 'Noto Sans JP',
            },
        })
        const pngData = resvg.render();
        const pngBuffer = pngData.asPng();
        resolve(pngBuffer);
    })
}


// MAIN PART
try {
    var preferences = await loadPreferences(options.preferences);
} catch (error) {
    console.error('An error occured during loading preferences.')
    console.error(error.message);
    exit(1);
}
const APIKEY = options.apikey ? options.apikey : preferences.fetch.API_KEY ? preferences.fetch.API_KEY : '';
if (!APIKEY || APIKEY.trim() == '') {
    console.error('Cannot get the API key.');
    console.error('Use the --apikey option or set fetch.API_KEY in preferences file.');
    exit(1);
}

try {
    var taiwanGeoJson = JSON.parse(fs.readFileSync(preferences.map.topojsonData));
    taiwanGeoJson = topojson.feature(taiwanGeoJson, taiwanGeoJson.objects['taiwan']);
    var taiwanCentroids = JSON.parse(fs.readFileSync(preferences.map.centroidsData)).features;
} catch (error) {
    console.error('An error occured during loading map data.')
    console.error(error.message);
    exit(1);
}

try {
    var earthquakes = await fetchEarthquakes(APIKEY, preferences.fetch.request_uri);
} catch (error) {
    console.error('An error occured during fetching API.')
    console.error(error.message);
    exit(1);
}

for (const earthquake of earthquakes.records.Earthquake) {
    if (options.number !== 'ALL' && earthquake.EarthquakeNo.toString() !== options.number) {
        continue;
    }
    console.log('Generating #'+earthquake.EarthquakeNo);
    var t = performance.now();
    try {
        fs.writeFileSync(preferences.output.file.replace('%', earthquake.EarthquakeNo), await generateSvg(earthquake, preferences));
        console.log('#'+earthquake.EarthquakeNo+' has been saved to '+preferences.output.file.replace('%', earthquake.EarthquakeNo));
    } catch (error) {
        console.error('An error occured during generating image #'+earthquake.EarthquakeNo+'.')
        console.error(error.message);
        exit(1);
    }
    console.log('Generated #'+earthquake.EarthquakeNo+' in '+Math.round(performance.now()-t)+'ms.');
}