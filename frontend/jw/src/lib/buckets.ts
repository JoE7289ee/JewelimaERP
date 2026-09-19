// One colour per stone bucket, used everywhere a bucket appears, so a colour
// means the same thing on every screen of the app.
export const BUCKET_COLOUR: Record<string, string> = {
	dmd: "#8FD3F4", ps: "#E58FA8", cs: "#7BD8A4", cz: "#C9A9E8",
	cvd: "#F2C57C", sw: "#F09A9A", pdmd: "#9FB3D9", poth: "#C2C7B0",
};
export const bucketColour = (code: string) => BUCKET_COLOUR[code] ?? "#C2C7B0";
