import fs from 'fs';
import path from 'path';
import colors from "vuetify/es5/util/colors";

export default {
    server: {
        https: {
            key: fs.readFileSync(path.resolve(__dirname, 'privkey.pem')),
            cert: fs.readFileSync(path.resolve(__dirname, 'fullchain.pem'))
        }
    },
    // Disable server-side rendering: https://go.nuxtjs.dev/ssr-mode
    ssr: false,

    // Target: https://go.nuxtjs.dev/config-target
    target: "static",

    // Global page headers: https://go.nuxtjs.dev/config-head
    head: {
        titleTemplate: "%s",
        title: "AquaDEX",
        htmlAttrs: {
            lang: "en",
        },
        meta: [
            { charset: "utf-8" },
            { name: "viewport", content: "width=device-width, initial-scale=1" },
            { hid: "description", name: "description", content: "" },
            { name: "format-detection", content: "telephone=no" },
        ],
        link: [{ rel: "icon", type: "image/x-icon", href: "/favicon.ico" }],
    },

    // Global CSS: https://go.nuxtjs.dev/config-css
    css: ["@/styles/styles.scss"],

    // Plugins to run before rendering page: https://go.nuxtjs.dev/config-plugins
    plugins: [
        "@/plugins/device.client",
        "@/plugins/vue-composition-api",
        "@/plugins/vuetify",
    ],

    // Auto import components: https://go.nuxtjs.dev/config-components
    components: true,

    // Modules for dev and build (recommended): https://go.nuxtjs.dev/config-modules
    buildModules: [
        // https://go.nuxtjs.dev/vuetify
        '@nuxt/typescript-build',
        "@nuxtjs/vuetify",
    ],

    // Modules: https://go.nuxtjs.dev/config-modules
    modules: [
        // https://go.nuxtjs.dev/axios
        "@nuxtjs/axios",
        "@nuxtjs/style-resources",
    ],

    styleResources: {
        scss: [
            "@/plugins/vuetify/default-preset/preset/overrides.scss",
            "@/plugins/vuetify/default-preset/preset/variables.scss",
        ],
    },

    // Axios module configuration: https://go.nuxtjs.dev/config-axios
    axios: {
        // Workaround to avoid enforcing hard-coded localhost:3000: https://github.com/nuxt-community/axios-module/issues/308
        baseURL: "/"
    },

    // Vuetify module configuration: https://go.nuxtjs.dev/config-vuetify
    vuetify: {
        // customVariables: ["~/assets/variables.scss"],
        theme: {
            themes: {
                dark: {
                    primary: "#9155FD",
                    accent: "#0d6efd",
                    secondary: "#8A8D93",
                    success: "#56CA00",
                    info: "#16B1FF",
                    warning: "#FFB400",
                    error: "#FF4C51",
                },
                light: {
                    primary: "#009688",
                    secondary: "#03a9f4",
                    accent: "#00bcd4",
                    error: "#f44336",
                    warning: "#ff9800",
                    info: "#3f51b5",
                    success: "#4caf50",
                    /*primary: "#9155FD",
                    accent: "#0d6efd",
                    secondary: "#8A8D93",
                    success: "#56CA00",
                    info: "#16B1FF",
                    warning: "#FFB400",
                    error: "#FF4C51",*/
                },
            },
        },
    },

    // Build Configuration: https://go.nuxtjs.dev/config-build
    build: {
        transpile: [
            '@solana/buffer-layout-utils',
            '@solana/spl-token',
            '@solana/wallet-adapter-base',
            '@solana/wallet-adapter-solflare',
            '@solana/wallet-adapter-phantom',
            '@solana/wallet-adapter-glow',
        ],
        extend(config) {
                config.module.rules.push({
                        test: /\.mjs$/,
                        include: /node_modules/,
                        type: "javascript/auto"
                })
        }
    },
};
