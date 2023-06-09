<template>
  <div class="dataset-card-container"  ref="container">
    <div class="dataset-card"  ref="card">
      <div class="seperator-path"></div>
      <div v-loading="loading" class="card" >
        <span class="card-left">
          <image-gallery v-if="!loading" 
            :datasetId="String(discoverId)"
            :datasetVersion="version"
            :entry="entry"
            :envVars="envVars"
            :label="label"
            :datasetThumbnail="thumbnail"
            :dataset-biolucida="biolucidaData"
            :category="currentCategory"
            @card-clicked="galleryClicked"
          />
        </span>
        <div class="card-right" >
          <div class="title" @click="cardClicked">{{entry.name}}</div>
          <div class="details">{{contributors}} {{entry.publishDate ? `(${publishYear})` : ''}}</div>
          <div class="details">{{samples}}</div>
          <div v-if="!entry.detailsReady" class="details loading-icon" v-loading="!entry.detailsReady"></div>
          <div>
            <el-button v-if="entry.simulation"  @click="openRepository" size="mini" class="button" icon="el-icon-view">View repository</el-button>
          </div>
          <div class="badges-container">
            <badges-group
              :entry="entry"
              :dataset-biolucida="biolucidaData"
              @categoryChanged="categoryChanged"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>


<script>
/* eslint-disable no-alert, no-console */
import Vue from "vue";
import BadgesGroup from "./BadgesGroup.vue";
import { Button, Icon } from "element-ui";
import lang from "element-ui/lib/locale/lang/en";
import locale from "element-ui/lib/locale";
import EventBus from "./EventBus"
import speciesMap from "./species-map";
import ImageGallery from "./ImageGallery.vue";

locale.use(lang);
Vue.use(Button);
Vue.use(Icon);

export default {
  name: "DatasetCard",
  components: { BadgesGroup, ImageGallery },
  props: {
    /**
     * Object containing information for
     * the required viewing.
     */
    entry: {
      type: Object,
      default: () => {}
    },
    envVars: {
      type: Object,
      default: () => {}
    },
  },
  data: function () {
    return {
      thumbnail: require('../../assets/missing-image.svg'),
      dataLocation: this.entry.doi,
      discoverId: undefined,
      loading: true,
      version: 1,
      lastDoi: undefined,
      biolucidaData: undefined,
      currentCategory: "All"
    };
  },
  computed: {
    contributors: function() {
      let text = "";
      if (this.entry.contributors) {
        if (this.entry.contributors.length === 1) {
          text = this.lastName(this.entry.contributors[0].name);
        } else if (this.entry.contributors.length === 2) {
          text = this.lastName(this.entry.contributors[0].name) + " & " + this.lastName(this.entry.contributors[1].name);
        } else if (this.entry.contributors.length > 2) {
          text = this.lastName(this.entry.contributors[0].name) + " et al.";
        }
      }
      return text;
    },
    samples: function() {
      let text = "";
      if (this.entry.species) {
        if (speciesMap[this.entry.species[0].toLowerCase()]){
          text = `${speciesMap[this.entry.species[0].toLowerCase()]}`;
        } else {
          text = `${this.entry.species}`;
        }
      }
      if (this.entry.numberSamples > 0) {
        text += " (";
        if (this.entry.numberSamples === 1) {
          text += `${this.entry.numberSamples} sample`;
        } else if (this.entry.numberSamples > 1) {
          text += `${this.entry.numberSamples} samples`;
        }
        if (this.entry.numberSubjects === 1) {
          text += ` from ${this.entry.numberSubjects} subject`;
        } else if (this.entry.numberSamples > 1) {
          text += ` from ${this.entry.numberSubjects} subjects`;
        }
        text += ")";
      }

      return text;
    },
    label: function(){
      return this.entry.organs ? this.entry.organs[0] : this.entry.name
    },
    publishYear: function() {
      return this.entry.publishDate.split('-')[0]
    }
  },
  methods: {
    cardClicked: function(){
      this.openDataset()
    },
    categoryChanged: function(name) {
      this.currentCategory = name;
    },
    galleryClicked: function(payload) {
      this.propogateCardAction(payload)
    },
    openDataset: function(){
      window.open(this.dataLocation,'_blank');
    },
    openRepository: function() {
      let apiLocation = this.envVars.API_LOCATION;
      this.entry.additionalLinks.forEach(function(el) {
        if (el.description == "Repository") {
          let xmlhttp = new XMLHttpRequest();
          xmlhttp.open("POST", apiLocation + "/pmr_latest_exposure", true);
          xmlhttp.setRequestHeader("Content-type", "application/json");
          xmlhttp.onreadystatechange = () => {
            if (xmlhttp.readyState === 4) {
              let url = "";
              if (xmlhttp.status === 200) {
                url = JSON.parse(xmlhttp.responseText)["url"];
              }
              if (url === "") {
                url = el.uri;
              }
              window.open(url,'_blank');
            }
          };
          xmlhttp.send(JSON.stringify({workspace_url: el.uri}));
        }
      });
    },
    propogateCardAction: function(action){
      EventBus.$emit("PopoverActionClick", action)
      this.$emit('contextUpdate', action)
    },
    splitDOI: function(doi){
      return [doi.split('/')[doi.split('/').length-2], doi.split('/')[doi.split('/').length-1]]
    },
    getBanner: function () { // NOTE! This getBanner uses the pennsieve api to retrive the banner. Only use for curation!
      if (this.entry.datasetId.length > 4){
        this.loading = true
        this.getPennsieveBanner()
      } else if (this.lastDoi !== this.entry.doi) {
        this.lastDoi = this.entry.doi
        this.loading = true
        let doi = this.splitDOI(this.entry.doi)
        fetch(`${this.envVars.PENNSIEVE_API_LOCATION}/discover/datasets/doi/${doi[0]}/${doi[1]}`)
          .then((response) =>{
            if (!response.ok){
              throw Error(response.statusText)
            } else {
              return response.json()
            }
          })
          .then((data) => {
            this.thumbnail = data.banner
            this.discoverId = data.id
            this.version = data.version
            this.dataLocation = `https://sparc.science/datasets/${data.id}?type=dataset`
            if (this.discoverId.length < 5) this.getBiolucidaInfo(this.discoverId)
            this.loading = false
          })
          .catch(() => {
            //set defaults if we hit an error
            this.thumbnail = require('../../assets/missing-image.svg')
            this.discoverId = Number(this.entry.datasetId)
            this.loading = false
          });
      } 
    },
    getPennsieveBanner: function(){
      // authenticate with pennsieve
      fetch(`${this.envVars.API_LOCATION}get_banner/${this.entry.datasetId}`).then(res=>res.json()).then(res=>{
        this.thumbnail = res.banner
        this.discoverId = this.entry.datasetId
        this.loading = false
      })
    },
    // getBanner: function () {
    //   // Only load banner if card has changed
    //   if (this.lastDoi !== this.entry.doi) {
    //     this.lastDoi = this.entry.doi
    //     this.loading = true
    //     let doi = this.splitDOI(this.entry.doi)
    //     fetch(`${this.envVars.PENNSIEVE_API_LOCATION}/discover/datasets/doi/${doi[0]}/${doi[1]}`)
    //       .then((response) =>{
    //         if (!response.ok){
    //           throw Error(response.statusText)
    //         } else {
    //           return response.json()
    //         }
    //       })
    //       .then((data) => {
    //         this.thumbnail = data.banner
    //         this.discoverId = data.id
    //         this.version = data.version
    //         this.dataLocation = `https://sparc.science/datasets/${data.id}?type=dataset`
    //         this.getBiolucidaInfo(this.discoverId)
    //         this.loading = false
    //       })
    //       .catch(() => {
    //         //set defaults if we hit an error
    //         this.thumbnail = require('@/../assets/missing-image.svg')
    //         this.discoverId = Number(this.entry.datasetId)
    //         this.loading = false
    //       });
    //   }

    // },
    lastName: function(fullName){
      return fullName.split(',')[0]
    },
    getBiolucidaInfo: function(id) {
      let apiLocation = this.envVars.API_LOCATION;
      let endpoint = apiLocation + "image_search/" + id;
      // Add parameters if we are sent them
      fetch(endpoint)
        .then(response => response.json())
        .then(data => {
          if (data.status == "success")
            this.biolucidaData = data;
        });
    }
  },
  created: function() {
    this.getBanner()
  },
  watch: {
    // currently not using card overflow
    'entry.description': function() { // watch it
      this.getBanner()
    }
  },
};
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
.dataset-card {
  padding-left: 16px;
  position: relative;
  min-height:17rem;
}

.title {
  padding-bottom: 0.75rem;
  font-family: Asap;
  font-size: 14px;
  font-weight: bold;
  font-stretch: normal;
  font-style: normal;
  line-height: 1.5;
  letter-spacing: 1.05px;
  color: #484848;
  cursor: pointer;
}
.card {
  padding-top: 18px;
  position: relative;
  display: flex;
}

.card-left{
  flex: 1
}

.card-right {
  flex: 1.3;
  padding-left: 6px;
}

.button{
  z-index: 10;
  font-family: Asap;
  font-size: 14px;
  font-weight: normal;
  font-stretch: normal;
  font-style: normal;
  line-height: normal;
  letter-spacing: normal;
  background-color: #8300bf;
  border: #8300bf;
  color: white;
  cursor: pointer;
  margin-top: 8px;
}

.button:hover {
  background-color: #8300bf;
  color: white;
}

.banner-img {
  width: 128px;
  height: 128px;
  box-shadow: 0 2px 4px 0 rgba(0, 0, 0, 0.25);
  background-color: #ffffff;
  cursor: pointer;
}
.details{
  font-family: Asap;
  font-size: 14px;
  font-weight: normal;
  font-stretch: normal;
  font-style: normal;
  line-height: 1.5;
  letter-spacing: 1.05px;
  color: #484848;
}

.badges-container {
  margin-top:0.75rem;
}

.loading-icon {
  z-index: 20;
  width: 40px;
  height: 40px;
  left: 80px;
}

.loading-icon >>> .el-loading-mask {
  background-color: rgba(117, 190, 218, 0.0) !important;
}

.loading-icon >>> .el-loading-spinner .path {
  stroke: #8300bf;
}
</style>
