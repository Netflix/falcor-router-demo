# Falcor Router Demo

This project builds and exports a Router factory function. The Router creates a virtual JSON Graph object for a Netflix-like application, and is intended to be exposed as JSON resource on a Node Application Server. The JSON Graph object is referred to as "virtual", because it is not stored in memory anywhere. Instead the Router builds requested subsets of the JSON Graph on-demand by accessing up to three different databases. This creates the illusion that there is a JSON resource on the application server, when in fact the application server is completely stateless and retrieves requested data on-the-fly from the data stores.

## A Virtual JSON Graph for Netflix

When a member logs into the Netflix application, they see a personalized list of genres, each of which contains a personalized list of titles.

![Netflix Homepage](http://netflix.github.io/falcor/images/netflix-screenshot.png)

The Router creates a JSON Graph object that models the Netflix domain model:

~~~js
{
  genrelist: [
    {
      name: "Horror",
      titles: [
        { $type: "ref", value: ["titlesById", 234] },
        // more title references snipped
      ]
    },
    // more genre lists snipped
  ],
  titlesById: {
    234: {
      "name": "Blitz",
      "year":2011,
      "description":"With a serial killer on the loose...",
      "rating":1.7,
      "boxshot":"http://cdn.test.nflximg.net/images/9236/1919236.jpg",
      "userRating": 5
    },
    // many more titles snipped
  }
}
~~~

You can manipulate the JSON Graph's  using the (get, set, 
Each Netflix user gets different a different set of personalize recommendations.  This is accomplished by passing the Netflix Router constructor a userId argument.

~~~js
var router = require('falcor-router-demo')(userId);
~~~

If no user ID is provided to the Router, a generic set of recommendations is made and there is no ability to set a userRating
The router allows you to retrieve data from this JSON  graph object as if it existed in memory. However in reality the data that makes up the contents of this object is spread across three different databases.


