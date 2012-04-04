VERSION=0.8
DATE=$(shell date +%Y-%m-%d)
SRC=./src/main
BUILD=./build
DIST=./dist/${VERSION}
NAME = uritemplates
UGLIFY_JS ?= `which uglifyjs`
WATCHR ?= `which watchr`

build: js

js:
	@@if test ! -z ${UGLIFY_JS}; then \
		mkdir -p ${BUILD}; \
		sed -e 's/@VERSION/'"v${VERSION}"'/' -e 's/@DATE/'"${DATE}"'/' <${SRC}/js/${NAME}.js >${BUILD}/${NAME}.js; \
		uglifyjs -o ${BUILD}/${NAME}.min.js    ${BUILD}/${NAME}.js;\
		echo "js compress and uglify sucessful! - `date`"; \
	else \
		echo "You must have the UGLIFYJS minifier installed in order to minify uritemplates' js."; \
		echo "You can install it by running: npm install uglify-js -g"; \
	fi

makedist:
	@@if test -d ${BUILD}; then \
	    mkdir -p ${DIST}; \
        cp ${BUILD}/${NAME}.js      ${DIST}/${NAME}-${VERSION}.js; \
        cp ${BUILD}/${NAME}.min.js  ${DIST}/${NAME}-${VERSION}.min.js; \
        echo "success building distro for version ${VERSION} - `date`; \
        echo "now test then add, commit, tag and push through git to publish"; \
	else \
		echo "No build is available. Run 'make' or explicitely 'make build' first."; \
	fi

dist: build makedist

watch:
	@@if test ! -z ${WATCHR}; then \
	  echo "Watching files in src/main"; \
	  watchr -e "watch('src/main/.*/.*js') { system 'make' }"; \
	else \
		echo "You must have the watchr installed in order to watch uritemplate js files."; \
		echo "You can install it by running: gem install watchr"; \
	fi

.PHONY: build watch
