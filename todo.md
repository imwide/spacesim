Make asteroids higher poly. Keep the current poly for a further a way LOD but on a closer scale they should look more defined. The smaller ones only need to be a bit higher poly but the bigger ones should not only be higher poly but also have more abstract shapes. The current ones just look like stretched spheres.

Make asteroid groups/fields also spawn around planets just like moons.


Make it possible for planets to have a saturn like asteroid belt around it. Add this to the config of 2 planets already for testing. Add parameters like the starting radius and end radius and the rotation of the ring. The ring/belt should at least from a distance simply be a semi-transparent texture. When getting close enough to a part of the belt, this part should radally around the distance from the camera fade out smoothly. This should happen at 500km. The faded out part should be replaced by 2d billboard sprites that are also semi transparent and have the same color as the ring texture in that position. Eventhough they are semi transparent, them overlapping should not add the color. Getting closer than 50km should spawn actual 3d asteroids just like in the current asteroid groups. The other levels of detail of the belt such as the texture and the billboards should still be visible. To not run into performance issues, introduce frustum culling and introduce your own performance optimizations.
These single asteroids should obviously not exist as destinations for autopilot.

The turning can happen really fast right now. The intensity that the turn and rotation of the ship is started at is really high. it should "fade in" and slowly start turning as it is has a lot of weight

While flying the ship (in the pilot seat) allow for switching perspectives. Currently its only third person perspective where the camera orbits around the ship. When pressing a hotkey for swithcing perspectives, it toggles between third person and first person perspective. In first person perspective, the camera should be fixed in place but not rotation, 1m above the ships "pilot seat" position. The ship inside should be rendered again isntead of the outside. The controls should be identical.

Ship collisions with stations and asteroids need to work

Ship landing in stations needs to work

Add light nodes to the station models. This will allow every station to have a array of relative coordinates (that will also be shown with the debug crosshairs)



Fix station safe zone shooting glitch: when the ship's center is still outside of the station's safe zone but one of the ships guns is already inside, the projectiles will fly inside the safe zone and be able to hit targets. Fix this by not firing any guns inside of safe zones aswell as not allowing projectiles to fly inside of safe zones.

Turning collision detector

The highlight tag highlighting an autopilot target currently doesnt clear when the autopilot is disengaged. This is fine, but there should always only be one highlighted tag at a time and no matter what is currently highlighted, under the "disengage autopilot" button in the navigator UI, also add the option to clear the highlighted tag, if there is one, and if its not there because of the autopilot

Ship backwards flying


BLENDER TODO: decrease glow intensity, apply array, screw stickers dont work/have no outline.


Edge shader triangle collapse: prefer straight edges/aligned with axes edges

Player height is too tall inside the ship. I used a reference in blender that was the same apparent height of 1.7m and its eyelevel was lower than the one in the game.


Integrating drones step by step:



- Let's add our first item: A drone. This one is called the "scout_drone" It should be available in the drone tab in the admin item menu. Thumbnail and 3d model (glb file, including LODs prepared for the existing LOD system) can be found under public/models/drones and public/textures/thumbnails
For each drones (there will be more in the future) add a config file with for now the paths of the model and thumbnail. The palyer should for now just be able to get this drone from the menu, and have it as an item. no additional functionality yet.


When disengaging autopilot at any speed, keep momentum, but as long as the ship is faster than its normal max speed, apply deceleration so that it would be stationary within 20 seconds multiplied by the ships braking multiplier

Add targeting option in the navigator UI which will always make the ship point to the target.

Make ship slowly turn horizontal while no user input (as currently happens if the player exits the pilot seat or ship entirely.)

if any mesh inside a glb file has the word "organic" in its name, the "blender" like edge shader should not be applied but instead the old outline shader should be applied. Also rename this old outline shader to the "organic outline shader" and the blender like edge shader to the "geometric edge shader".



This pathfinding should also be applied to drones.
New low-distance autopilot pathfinding (targets less than 15km away):
Generate a flightpath. The flightpath should be visualized through a yellow line in debug mode.
At first its a straight line. If the straight line intersects with any objects, a point of intersection is "marked" like a vertice/node on this line. This point is then moved away from the object in the direction from its center to the point until it is at least 200m away from the object's surface. Repeat this process up to 10 times or until there are no intersections anymore.
The line is then smoothed out by applying a bezier curve to it. The ship then follows this line while leaning in the curves and while correctly using acceleration and deceleration as in normal flight. The ship can during low distance autopilot never move faster than its normal max speed.