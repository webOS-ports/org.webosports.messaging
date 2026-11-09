/* pictures.js - a picture from a chat, saved where Photos finds it.
 *
 *   savePicture { path }   -> { path, saved }
 *
 * The chat services keep what they receive in folders the media indexer leaves alone
 * (/media/internal/.im-attachments/<service>, Telegram's /media/internal/.cryptofs/...): on Sargo
 * not one of their pictures was in com.palm.media.image.file:1, so Photos, which shows only what
 * is there, could not show them. The picture viewer's Save copies one into SAVE_DIR, which the
 * indexer does watch, as it does every visible folder of /media/internal. A web app cannot copy a
 * file itself, and the download manager takes http, https and ftp only, so the service does it.
 *
 * Only a picture (by its extension) of the device's media, followed through links, and not larger
 * than MAX_BYTES. A name taken already gets " (2)", " (3)"...; the same picture saved again is
 * not copied a second time (saved: false).
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { missingArgs, badArgs } = require("./errors.js");

const MEDIA = "/media/internal";
const SAVE_DIR = MEDIA + "/Messaging";
const PICTURE = /\.(jpe?g|png|gif|webp|bmp)$/i;
const MAX_BYTES = 64 * 1024 * 1024;
const MAX_NAMES = 1000;

async function sameFile(fsp, a, b, size) {
	const st = await fsp.stat(b);
	if (st.size !== size) { return false; }
	const [x, y] = await Promise.all([fsp.readFile(a), fsp.readFile(b)]);
	return x.equals(y);
}

function createPictures({ fsp = fs.promises, media = MEDIA, saveDir = SAVE_DIR } = {}) {
	async function savePicture(params) {
		const given = params && params.path;
		if (typeof given !== "string" || !given) { throw missingArgs("path is required"); }
		let file = given.replace(/^file:\/\//i, "");
		try { file = decodeURIComponent(file); } catch (e) { throw badArgs("path is not a file name"); }
		if (!path.isAbsolute(file)) { throw badArgs("path is not absolute"); }
		let real;
		try { real = await fsp.realpath(file); } catch (e) { throw badArgs("no such file"); }
		if (!real.startsWith(media + "/")) { throw badArgs("not a file of the device's media"); }
		if (!PICTURE.test(real)) { throw badArgs("not a picture"); }
		const st = await fsp.stat(real);
		if (!st.isFile()) { throw badArgs("not a file"); }
		if (st.size > MAX_BYTES) { throw badArgs("too large to save"); }
		if (path.dirname(real) === saveDir) { return { path: real, saved: false }; }

		await fsp.mkdir(saveDir, { recursive: true });
		const ext = path.extname(real);
		const base = path.basename(real, ext);
		for (let n = 1; n <= MAX_NAMES; n++) {
			const dest = path.join(saveDir, n === 1 ? base + ext : base + " (" + n + ")" + ext);
			try {
				await fsp.copyFile(real, dest, fs.constants.COPYFILE_EXCL);
				return { path: dest, saved: true };
			} catch (e) {
				if (e.code !== "EEXIST") { throw e; }
				if (await sameFile(fsp, real, dest, st.size)) { return { path: dest, saved: false }; }
			}
		}
		throw badArgs("no free name for it in " + saveDir);
	}

	return { savePicture };
}

module.exports = { createPictures, SAVE_DIR, MAX_BYTES };
