import { create } from "storybook/theming";
import logo from "./static/logo.svg?url";

const isDev = process.env.NODE_ENV === "development";

export default create({
    base: "light",
    brandTitle: "CatColab UI Components",
    brandImage: logo,
    brandUrl: isDev ? "/" : "/dev/ui-components/",
    brandTarget: "_self",
});
