// Импортируем Gulp из пакета Gulp
// import { appendFile } from "fs";
import gulp from "gulp";
import del from "del";
import fileInclude from "gulp-file-include";
import replace from "gulp-replace";
import webpHtmlNosvg from "gulp-webp-html-nosvg";
import versionNumber from "gulp-version-number";
import plumber from "gulp-plumber";
import notify from "gulp-notify";
import browsersync from "browser-sync";
import dartSass from "sass";
import gulpSass from "gulp-sass";
import rename from "gulp-rename"
import cleanCss from "gulp-clean-css";
import webpcss from "gulp-webpcss";
import autoprefixer from "gulp-autoprefixer";
import groupCssMediaQueries from "gulp-group-css-media-queries";
import webpack from "webpack-stream";
import webp from "gulp-webp";
import imagemin from "gulp-imagemin";
import newer from "gulp-newer"; //проверка обновлений
import fs from "fs";//загружать не надо, т.к. поставляется с пакетом node
import fonter from "gulp-fonter";
import ttf2woff2 from "gulp-ttf2woff2";
import svgSprite from "gulp-svg-sprite";
import ifPlugin from "gulp-if"; //условное ветвление
import zipPlugin from "gulp-zip";
import { configFTP } from '../config/ftp.js'
import vinylFTP from "vinyl-ftp";
import util from "gulp-util";

//Получаем имя папки проекта
import * as nodePath from 'path';
const rootFolder = nodePath.basename(nodePath.resolve());

//Настроим пути к папкам и файлам
const buildFolder = `dist`; 
const srcFolder = `src`;

//создаем константы плагинов
const plugins = {
	replace : replace,
	plumber : plumber,
	notify : notify,
	browsersync: browsersync,
	newer: newer,
	if: ifPlugin
};

const sass = gulpSass(dartSass);

const path = {
	build: {
		js: `${buildFolder}/js/`,
		css: `${buildFolder}/css/`,
        html: `${buildFolder}/`,
		images: `${buildFolder}/img/`,
		fonts: `${buildFolder}/fonts/`,
        files: `${buildFolder}/plugins/`	
	},
	src: {
		js: `${srcFolder}/js/*main.js`,
		images: `${srcFolder}/img/**/*.{png,jpg,jpeg,gif,webp}`,
		svg: `${srcFolder}/img/**/*.svg`,
		scss: `${srcFolder}/scss/*.scss`,
        html: `${srcFolder}/*.html`,
        files: `${srcFolder}/plugins/**/*.*`,
		svgicons: `${srcFolder}/svgicons/*.svg`,//для создания svg-спрайтов
	},
	watch: {
		js: `${srcFolder}/js/**/*.js`,
		scss: `${srcFolder}/scss/**/*.scss`,
        html: `${srcFolder}/**/*.html`,
		images: `${srcFolder}/img/**/*.{png,jpg,jpeg,gif,webp,svg,ico}`,
        files: `${srcFolder}/plugins/**/*.*`,
	},
    clean: buildFolder,
    buildFolder: buildFolder,
    srcFolder: srcFolder,
    rootFolder: rootFolder,
    //сможем указывать папку на удаленном сервере 
    ftp: `test`
}


//передаем значения в глобальную переменную
global.app = {
	isBuild: process.argv.includes('--build'), // хранит флаг '--build', значит режим продакшена
	isDev: !process.argv.includes('--build'), // не хранит флаг '--build', значит режим разработчика
    path: path,
    gulp: gulp,
	plugins: plugins,
}

// функция browserSync для автоматического обновления окна браузера
const server = (done) => {
	app.plugins.browsersync.init({
 		server: {
			baseDir: `${app.path.build.html}`
 		},
 		port: 3000,
		notify: false, 
 	})
}

//функция создания папки dist и переноса в нее файлов из src
const copy = () => {
    return app.gulp.src(app.path.src.files)
        .pipe(app.gulp.dest(app.path.build.files))
}
//функция удаления dist
const reset = () => {
    return del(app.path.clean);
}
//функция обработки html-файлов и переноса из папки src в папку dist 
const html = () => {
    return app.gulp.src(app.path.src.html)
		.pipe(app.plugins.plumber(
			app.plugins.notify.onError({
				title:"HTML",
				message:"Error: <%= error.message %>"
			}))
			)
        .pipe(fileInclude()) //собираем файл html из частей
		.pipe(app.plugins.replace(/@img\//g, 'img/')) //чтобы браузер распознавал путь к картинке, с помощью регулярного выражения меняем название в пути с @img на img
		.pipe(
			app.plugins.if(
				app.isBuild,
				webpHtmlNosvg()
			)
		)
		.pipe(
			app.plugins.if(
				app.isBuild,
				versionNumber({
					//к файлам добавляется текущая дата и время, для избежания кеширования
					'value': '%DT%',
					'append': {
						'key': '_v',
						'cover': 0,
						'to': [
							'css',
							'js',
						]
					},
					'output': {
						//создается файл
						'file': 'version.json'
					}
				})
			)	
		) 
        .pipe(app.gulp.dest(app.path.build.html))
		.pipe(app.plugins.browsersync.stream());
}

//функция обработки css-файлов и переноса из папки src в папку dist 
const scss = () => {
    return app.gulp.src(app.path.src.scss, { sourcemaps: app.isDev })
	.pipe(app.plugins.plumber(
		app.plugins.notify.onError({
			title:"SCSS",
			message:"Error: <%= error.message %>"
		})))
	.pipe(app.plugins.replace(/@img\//g, '../img/'))
		.pipe(sass({
			outputStyle: 'expanded'
		}))
		.pipe(
			app.plugins.if(
				app.isBuild,
				groupCssMediaQueries()
			)
		)
		.pipe(
			app.plugins.if(
				app.isBuild,
				webpcss({
					webpClass: ".webp",
					noWebpClass: ".no-webp"
				})
			)
		)
		.pipe(
			app.plugins.if(
				app.isBuild,
				autoprefixer({
					grid: true,
					overrideBrowserslist: ['last 10 versions'],
					cascade: true
				})
			)
		)
		.pipe(app.gulp.dest(app.path.build.css)) // если нужен несжатый файл стилей
		.pipe(
			app.plugins.if(
				app.isBuild,
				cleanCss()
			)
		)
		.pipe(rename({
			extname : '.min.css'
		}))
        .pipe(app.gulp.dest(app.path.build.css))
		.pipe(app.plugins.browsersync.stream());
}

//функция обработки js-файлов и переноса из папки src в папку dist 
const js = () => {
    return app.gulp.src(app.path.src.js, { sourcemaps: app.isDev })
		.pipe(app.plugins.plumber(
			app.plugins.notify.onError({
				title:"JS",
				message:"Error: <%= error.message %>"
			}))
			)
        .pipe(webpack({
			mode: app.isBuild ? 'production' : 'development',
			output: {
				filename: 'app.min.js'
			}
		}))
        .pipe(app.gulp.dest(app.path.build.js))
		.pipe(app.plugins.browsersync.stream());
}

//функция обработки img-файлов и переноса из папки src в папку dist 
const images = () => {
    return app.gulp.src(app.path.src.images) //получаем доступ к файлам
		.pipe(app.plugins.plumber(
			app.plugins.notify.onError({
				title:"IMAGES",
				message:"Error: <%= error.message %>"
			}))
			) //выявляем ошибки
		.pipe(app.plugins.newer(app.path.build.images))
		.pipe(
			app.plugins.if(
				app.isBuild,
				webp()
			)
		)
		.pipe(
			app.plugins.if(
				app.isBuild,
				app.gulp.dest(app.path.build.images)
			)
		)
		.pipe(
			app.plugins.if(
				app.isBuild,
				app.gulp.src(app.path.src.images)
			)
		)
		.pipe(
			app.plugins.if(
				app.isBuild,
				app.plugins.newer(app.path.build.images)
			)
		)
		.pipe(
			app.plugins.if(
				app.isBuild,
				imagemin({
					progressive: true,
					svgoPlugins: [{ removeViewBox: false }],
					interlaced: true,
					optimizationLevel: 4,
				})
			)
		)
        .pipe(app.gulp.dest(app.path.build.images)) //вынружаем, копируем в папку с результатами
		.pipe(app.gulp.src(app.path.src.svg))
		.pipe(app.gulp.dest(app.path.build.images))
		.pipe(app.plugins.browsersync.stream()); //обновляем браузер
}

//функция обработки шрифтов из формата otf в ttf
const otfToTtf = () => {
	// ищем шрифты формата .otf
	return app.gulp.src(`${app.path.srcFolder}/fonts/*.otf`, {})
		.pipe(app.plugins.plumber(
			app.plugins.notify.onError({
				title:"FONTS",
				message:"Error: <%= error.message %>"
			}))
			)
		//конвертируем в .ttf
		.pipe(fonter({
			formats: ['ttf']
		}))
		//выгружаем в исходную! папку
		.pipe(app.gulp.dest(`${app.path.srcFolder}/fonts/`))
}

//функция обработки шрифтов из формата ttf в woff и woff2
const ttfToWoff = () => {
	// ищем шрифты формата .otf
	return app.gulp.src(`${app.path.srcFolder}/fonts/*.ttf`, {})
		.pipe(app.plugins.plumber(
			app.plugins.notify.onError({
				title:"FONTS",
				message:"Error: <%= error.message %>"
			}))
			)
		//конвертируем в .woff
		.pipe(fonter({
			formats: ['woff']
		}))
		//Выгружаем в папку с результатом
		.pipe(app.gulp.dest(`${app.path.build.fonts}`))
		//Ищем файлы шрифтов .ttf
		.pipe(app.gulp.src(`${app.path.srcFolder}/fonts/*.ttf`))
		//Конвертируем в .woff2
		.pipe(ttf2woff2())
		//Выгружаем в папку с результатом
		.pipe(app.gulp.dest(`${app.path.build.fonts}`));
}

//Подключаем стили шрифтов
const fontsStyle = () => {
    //Файл стилей подключения шрифтов
    let fontsFile = `${app.path.srcFolder}/scss/_fonts.scss`;
    //Проверяем, существуют ли файлы шрифтов
    fs.readdir(app.path.build.fonts, function(err, fontsFiles){
        if(fontsFiles) {
            //Проверяем, существует ли файл стилей для подключения шрифтов
            if(!fs.existsSync(fontsFile)) {
                //Если файла нет, создаём его
                fs.writeFile(fontsFile, '', cb);
                let newFileOnly;
                for (var i = 0; i < fontsFiles.length; i++) {
                    //Записываем подключения шрифтов в файл стилей
                    let fontFileName = fontsFiles[i].split('.')[0];
                    if (newFileOnly !== fontFileName) {
                        let fontName = fontFileName.split('-')[0] ? fontFileName.split('-')[0] : fontFileName;
                        let fontWeight = fontFileName.split('-')[1] ? fontFileName.split('-')[1] : fontFileName;
                        if (fontWeight.toLowerCase() === 'thin') {
                            fontWeight = 100;
                        } else if (fontWeight.toLowerCase() === 'extralight') {
                            fontWeight = 200;
                        } else if (fontWeight.toLowerCase() === 'light') {
                            fontWeight = 300;
                        } else if (fontWeight.toLowerCase() === 'medium') {
                            fontWeight = 500;
                        } else if (fontWeight.toLowerCase() === 'semibold') {
                            fontWeight = 600;
                        } else if (fontWeight.toLowerCase() === 'bold') {
                            fontWeight = 700;
                        } else if (fontWeight.toLowerCase() === 'extrabold' || fontWeight.toLowerCase() === 'heavy') {
                            fontWeight = 800;
                        } else if (fontWeight.toLowerCase() === 'black') {
                            fontWeight = 900;
                        } else {
                            fontWeight = 400;
                        }
                        fs.appendFile(fontsFile, `@font-face{\n\tfont-family: ${fontName};\n\tfont-display: swap;\n\tsrc: url("../fonts/${fontFileName}.woff2") format("woff2"), url("../fonts/${fontFileName}.woff") format("woff");\n\tfont-weight: ${fontWeight};\n\tfont-style: normal;\n}\r\n`, cb);
                        newFileOnly = fontFileName;
                    }
                }
            } else {
                //Если файл есть, выводим сообщение
                console.log("Файл scss/fonts.scss уже существует. Для обновления файла нужно его удалить!");
            }
        }
    });
    return app.gulp.src(`${app.path.srcFolder}`);
    function cb() { }
}

//функция svg-спрайвов (наборов картинок)
const svgSprive = () => {
    return app.gulp.src(app.path.src.svgicons)
		.pipe(app.plugins.plumber(
			app.plugins.notify.onError({
				title:"SVG",
				message:"Error: <%= error.message %>"
			}))
		)
		.pipe(svgSprite({
			mode: {
				stack: {
					sprite: `../icons/icons.svg`,
					//создавать страницу с перечнем иконок
					example: true
				}
			},
		}))
        .pipe(app.gulp.dest(`${app.path.build.images}`))
}

//функция создания zip-архива готового проекта 
const zip = () => {
	//удаляем zip-архив, если он уже есть
	del(`./${app.path.rootFolder}.zip`); 
    return app.gulp.src(`${app.path.buildFolder}/**/*.*`, {})//берем все файлы всех уровней из итоговой папки, которая на продакшн
		.pipe(app.plugins.plumber(
			app.plugins.notify.onError({
				title:"ZIP",
				message:"Error: <%= error.message %>"
			}))
		)
		.pipe(zipPlugin(`${app.path.rootFolder}.zip`)) //архив будет наываться как корневая папка
        .pipe(app.gulp.dest('./')); //выгрузка в корень папки проекта
}

//функция подключения к ftp и выгрузки файлов на сервер
const ftp = () => {
	
	configFTP.log = util.log;
	const ftpConnect = vinylFTP.create(configFTP);
    return app.gulp.src(`${app.path.buildFolder}/**/*.*`, {})//берем все файлы всех уровней из итоговой папки, которая на продакшн
		.pipe(app.plugins.plumber(
			app.plugins.notify.onError({
				title:"FTP",
				message:"Error: <%= error.message %>"
			}))
		)
        .pipe(ftpConnect.dest(`/${app.path.ftp}/${app.path.rootFolder}`));
}

//для подключения по ftp вводим данные хостинга
let configFTP = {
	host: "", //адрес ftp сервера
	user: "", //имя пользователя
	password: "", //пароль
	parallel: 5, //количество одновременных потоков
}

//наблюдатель за изменениями в файлах
function watcher() {
    gulp.watch(path.watch.files, copy);
    gulp.watch(path.watch.html, html);
	gulp.watch(path.watch.scss, scss);
	gulp.watch(path.watch.js, js);
	gulp.watch(path.watch.images, images);
}

//единожды создаем свг-спрайт
export {  svgSprive }

//Последовательная обработка шрифтов
const fonts = gulp.series(otfToTtf, ttfToWoff, fontsStyle)

//одновременное копирование файлов и обработка html
const mainTasks = gulp.series(fonts, gulp.parallel(copy, html, scss, js, images));

//построение сценариев выполнения задач (метод series выпоняет задачи последовательно)
const dev = gulp.series(reset, mainTasks, gulp.parallel(watcher, server));
const build = gulp.series(reset, mainTasks);
const deployZIP = gulp.series(reset, mainTasks, zip);
const deployFTP = gulp.series(reset, mainTasks, ftp);
//экспорт сценариев
export { dev }
export { build }
export { deployZIP }
export { deployFTP }

//Выполнение сценария по умолчанию (временно)
gulp.task('default', dev);