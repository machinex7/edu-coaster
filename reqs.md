# Game Overview
This is a game written in plain Javascript, JSON, CSS, and HTML. This is a single player game, but will have functionality for teachers to review progress and stats.
The game is about running a theme park business. Teachers will set up the scenario, then students will design the park, make day to day business decisions, as well as long term planning and updates as interests and research changes. Their goal is to build a profitable park at the end of a certain number of rounds.

# Setup Overview
There are 2 main stages of setup.
1. Setup - This is done on the teacher side, and they can set a variety of attributes about the park. They can also pick pre-loaded setups to get the kids started with stuff like staffing more easily. Starting attributes for now are park size in tiles (x by y) and starting money.
2. Layout - Using their starting budget, students build out their park and hire initial staff, taking into account budget, wages, running reports on estimated utilites, and reports on estimated income from guest visits.
After that The game starts, each round playing out turn-based, advancing a week at a time.

# Rounds
There are multiple steps to each round made up of several things to do, review, plan, and act on. Many things take time to implement. Each round is meant to emulate what took place over the course of a week.
First steps are the reports for how much you made and how many guests you had. A simple graph of attendance, take, and overall profit/loss. You unlock more and more detailed reports as you continue.
You can take a variety of actions on your turn to try to improve your park.

# Staffing
Managing staffing is an important part of the game.
Ride Operator - Manages an individual ride. Too few and the rides run slower or riskier.
Security
Concessions Worker
Merchandise Attendant
Ticket Booth Attendant
Janitor - Cleans up trash and puke.
Engineer - Repairs rides when they break.
Business Analyst? - Runs Research
? - Runs Surveys/Interviews
? - Marketing Team

# Projects + Layout Management
Managing the park boundaries, rides, walkways, parking, bathrooms, emergency services, and food/toy attractions.
Outside of the initial setup stage, building or demolishing anything takes time. The bigger, the more time. A bathroom is a quick one. Whereas a large roller coaster may take months.
Projects are these various construction/demolition efforts. You can track them as see their progress with your current staff as well as projections for when it will be complete. Maybe even project with additional employees. You can also see if problems arise that set it back or cause additional work. You can even cancel a construction and quickly demolish it if you change your mind, but you don't get your money back. You can also see how much it has cost to build so far. The cost is paid out over time as you buy the materials and pay for labor. The buying parts is automatic as long as you have money.

# Surveys + Interviews
The player

# Awards
Awards phase happens each round normally, but it also happens now. Each player gets an award if they qualify. This can be used for marketing.
## Ride Related
Fastest Ride. Highest Ride. Longest Ride. Most Rides. Biggest Park.
## Park Related
Cleanest Park. Safest Park. Highest Customer Satisfaction. Most Guests.
## Silly
Biggest Parking Lot. Most Bathrooms.
 

# Research
If you have Business Analysts, you can have them perform market research which will unlock new options for actions and demographics and details and such. More skilled hire will prioritize useful stuff, but newbies may unlock weird ideas like a bathroom price.

# Reputation
The Reputation system manages how the park is viewed on several criteria. Each guest generates rep events that are accumulated and adjust your overall reputation. But also gives individual feedback should the player do an interview or survey.
Really liked/disliked a ride? Upset about how much something cost? Too many old rides. Dirty, unsafe, whatever.


# Park Price Actions
Choices the player can make about how the park prices things and makes money.
## Price Levers
These can be changed freely, but we track how long something has been in effect for. Frequent changes can hurt reputation. But positive changes for customers can be advertised.
- Gate Price per Adult / Kid / Toddler / Infant
- Parking Price per car
- Bathroom Price
- Ride Prices
- Food Upcharge
- Toy Upcharge
- Drink Upcharge
- Free Water
- Ride Photo Charge


## Price  Programs
Coupons (Broad distribution, or for prior customers, or for )
Discount Events (New Price, Demigraphic, Day/Time)
Membership Plans (Price, Frequency, # Guests allowed, Gate/Parking/Food/Other)

# Merchandise
You need locations and staff to sell merchandise. Too many locations and people get uninterested. Too few staff/security and theft becomes a problem.
Let people pick what the will sell? Stuffed Animal, Umbrella, Fidget Spinner, Silly String, Bouncey Balls, Maps
Some things have specific qualities, like an Umbrella selling for more when it's rainy. Or Silly String increasing the messiness of the park.

# Food


# Marketing Campaigns
These are used both to advertise your park with new customer, entice repeat customers with new attractions, and promote new programs to potential customers.
Medium: Social, Web, TV, Radio, Print
Number of Channels in that medium
Runs for X Days
Runs for up to X Views
Ad Provider: You hire a company to work with that coordinates the ad release. They quote you. You can pick from several, check their reviews and quotes. They have different criteria they can handle and with different efficiencies.
Award Focus: Mention awards you have won to increase attraction.
Mention price changes.
Mention price programs.
Wording, styling, coloring? Might need teacher to grade that on how well it works.



# Events
The crazy and unique fluff. Things that pop up periodically that are scripted and you have to decide how to resolve them, when direct action is required. Or it could be something that changes a major statistic that you now need to handle.



Demographics: Min Age, Max Age, Gender, Min Income, Max Income, Veteran, Rural vs Urban vs Suburban, Disabilities, Education, Marital Status, Household Size, Race/Ethnicity, Industry, Education Level, Geographic region, number of chidren, Language, Culture, Avg Pleasure Spending, Home Value, Number of Cars

Brand Partnerships
Partner with other companies for special products, product placement, co-marketing.


Also be cool to jave some map overlays, maybe a quick way to view tide status, ride demand, demographic appeal of each ride, money generation.
